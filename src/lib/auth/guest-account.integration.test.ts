import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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
          timeZone: "Europe/Madrid",
        },
      ]);
    } finally {
      await sql`delete from public.homes where id = ${home.id}`;
      await sql`delete from auth.users where id in (${userId}, ${otherUserId})`;
    }
  });
});
