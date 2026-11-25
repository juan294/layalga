import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    (await import("@/test-support/web-session")).webSession(async () => ({
      data: { user: { id: auth.userId } },
    })),
}));

import { claimPartyForUser } from "./party-claim";
import { createFixtureHousehold } from "@/test-support/fixture-household";
import { cancelAccountVisit } from "@/app/[locale]/visits/actions";
import { findInvitationByToken } from "@/core/booking/invitations";
import { closeDatabase } from "@/core/db/client";

import {
  hasPartyForUser,
  loadGuestAccountVisits,
  partyIsClaimedByUser,
} from "./guest-account";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
process.env.DATABASE_URL ??= databaseUrl;
const sql = postgres(databaseUrl, { prepare: false, max: 2 });

describe("guest account visit retrieval", () => {
  afterAll(async () => {
    await closeDatabase();
    await sql.end({ timeout: 5 });
  });

  it("keeps claims, links, private visit notes and cancellation separate for two equal names", async () => {
    const home = await createFixtureHousehold(sql, {
      label: `Equal guest labels ${randomUUID()}`,
      tokenSecret: process.env.LINK_TOKEN_SECRET!,
      parties: [{ familyName: "Rivera" }, { familyName: "Rivera" }],
    });
    const users = [randomUUID(), randomUUID()];
    try {
      const visitIds: string[] = [];
      for (const [index, guest] of home.parties.entries()) {
        const user = users[index]!;
        await sql`insert into auth.users (id, email, aud, role) values (${user}, ${user + "@fixture.test"}, 'authenticated', 'authenticated')`;
        expect(await claimPartyForUser(guest.token, user)).toBe(true);
        expect((await findInvitationByToken(sql, guest.token))?.partyId).toBe(
          guest.partyId,
        );
        const [visit] = await sql<{ id: string }[]>`insert into public.visits
          (home_id, party_id, invitation_id, stay, adults, status, guest_notes)
          values (${home.homeId},${guest.partyId},${guest.invitationId},'[2027-01-10,2027-01-12)',2,'confirmed',${`Private note ${index}`}) returning id`;
        visitIds.push(visit!.id);
      }
      for (const [index, user] of users.entries()) {
        const other = 1 - index;
        expect(await claimPartyForUser(home.parties[other]!.token, user)).toBe(
          false,
        );
        expect(await loadGuestAccountVisits(user)).toEqual([
          expect.objectContaining({
            id: visitIds[index],
            partyName: "Rivera",
            guestNotes: `Private note ${index}`,
          }),
        ]);
        auth.userId = user;
        const form = new FormData();
        form.set("confirmed", "yes");
        form.set("expectedVisitId", visitIds[other]!);
        form.set("expectedStay", "2027-01-10|2027-01-12");
        form.set("invitationId", home.parties[other]!.invitationId);
        await cancelAccountVisit(form);
        const [preserved] =
          await sql`select status from public.visits where id=${visitIds[other]!}`;
        expect(preserved?.status).toBe("confirmed");
        expect(
          (await findInvitationByToken(sql, home.parties[other]!.token))?.id,
        ).toBe(home.parties[other]!.invitationId);
      }
      auth.userId = users[0]!;
      const ownVisit = new FormData();
      ownVisit.set("confirmed", "yes");
      ownVisit.set("expectedVisitId", visitIds[0]!);
      ownVisit.set("expectedStay", "2027-01-10|2027-01-12");
      ownVisit.set("invitationId", home.parties[0]!.invitationId);
      await expect(cancelAccountVisit(ownVisit)).rejects.toThrow(
        "NEXT_REDIRECT",
      );
      const [cancelled] =
        await sql`select status from public.visits where id=${visitIds[0]!}`;
      const [unchanged] =
        await sql`select status from public.visits where id=${visitIds[1]!}`;
      expect(cancelled?.status).toBe("cancelled");
      expect(unchanged?.status).toBe("confirmed");
      expect(
        await findInvitationByToken(sql, home.parties[1]!.token),
      ).toMatchObject({ id: home.parties[1]!.invitationId });
    } finally {
      await home.cleanup();
      await sql`delete from auth.users where id in ${sql(users)}`;
    }
  });

  it("returns only visits for parties claimed by the authenticated user", async () => {
    const suffix = randomUUID();
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Guest account ${suffix}`}, 'Europe/Madrid')
      returning id
    `;
    if (!home) throw new Error("Failed to seed guest account home");

    try {
      await sql`
        insert into auth.users (id, email, aud, role, created_at, updated_at)
        values
          (${userId}, ${`guest.${suffix}@example.com`}, 'authenticated', 'authenticated', now(), now()),
          (${otherUserId}, ${`other.${suffix}@example.com`}, 'authenticated', 'authenticated', now(), now())
      `;
      const [host] = await sql<{ id: string }[]>`
        insert into public.hosts (home_id, display_name, locale)
        values (${home.id}, 'Host', 'en') returning id
      `;
      const parties = await sql<{ id: string; family_name: string }[]>`
        insert into public.parties (
          home_id, family_name, locale, link_token, auth_user_id
        ) values
          (${home.id}, 'Claimed family', 'en', ${randomUUID()}, ${userId}),
          (${home.id}, 'Other family', 'en', ${randomUUID()}, ${otherUserId})
        returning id, family_name
      `;
      if (!host || !parties[0] || !parties[1]) {
        throw new Error("Failed to seed guest account identities");
      }
      const invitations = await sql<{ id: string; party_id: string }[]>`
        insert into public.invitations (
          home_id, host_id, party_id, raw_message, link_token,
          link_token_expires_at
        ) values
          (${home.id}, ${host.id}, ${parties[0].id}, 'Claimed', ${randomUUID()}, '2027-01-01'),
          (${home.id}, ${host.id}, ${parties[1].id}, 'Other', ${randomUUID()}, '2027-01-01')
        returning id, party_id
      `;
      if (!invitations[0] || !invitations[1]) {
        throw new Error("Failed to seed guest account invitations");
      }
      const [claimedVisit] = await sql<{ id: string }[]>`
        insert into public.visits (
          home_id, party_id, invitation_id, stay, adults, status
        ) values (
          ${home.id}, ${parties[0].id}, ${invitations[0].id},
          '[2026-10-10,2026-10-13)', 2, 'confirmed'
        ) returning id
      `;
      await sql`
        insert into public.visits (
          home_id, party_id, invitation_id, stay, adults, status
        ) values (
          ${home.id}, ${parties[1].id}, ${invitations[1].id},
          '[2026-11-10,2026-11-13)', 2, 'confirmed'
        )
      `;

      expect(await hasPartyForUser(userId)).toBe(true);
      expect(await hasPartyForUser(randomUUID())).toBe(false);
      expect(await partyIsClaimedByUser(parties[0].id, userId)).toBe(true);
      expect(await partyIsClaimedByUser(parties[1].id, userId)).toBe(false);
      expect(await loadGuestAccountVisits(userId)).toEqual([
        {
          id: claimedVisit?.id,
          partyName: "Claimed family",
          stay: ["2026-10-10", "2026-10-13"],
          status: "confirmed",
          guestNotes: "",
          timeZone: "Europe/Madrid",
        },
      ]);
    } finally {
      await sql`delete from public.homes where id = ${home.id}`;
      await sql`delete from auth.users where id in (${userId}, ${otherUserId})`;
    }
  });
});
