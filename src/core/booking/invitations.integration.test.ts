import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { runAgentTask } from "@/agent/run-task";
import { TaskScriptedModel } from "@/agent/scripted-model-selection";
import { NoopScheduler } from "@/agent/scheduler";
import { createFixtureHousehold } from "@/test-support/fixture-household";
import { FakeClock } from "../clock";
import { confirmVisit, createTemporaryHold, rescheduleVisit } from "./holds";

import {
  captureInvitation,
  extendInvitationAccessForStay,
  findInvitationByToken,
  reissueInvitationLink,
} from "./invitations";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const db = postgres(connectionUrl, { max: 2, prepare: false });

describe("invitation persistence", () => {
  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("creates distinct parties for concurrent same-name New captures and reuses only the chosen returning record", async () => {
    const home = await createFixtureHousehold(db, {
      label: `Concurrent captures ${randomUUID()}`,
      tokenSecret: "synthetic-capture-secret",
      hosts: 2,
      parties: [],
    });
    const deps = {
      db,
      clock: new FakeClock(new Date()),
      scheduler: new NoopScheduler(),
      appUrl: "http://localhost:3008",
      locale: "en" as const,
    };
    const tasks = home.hostIds.map((hostId) => ({
      task: "host_capture_v2" as const,
      homeId: home.homeId,
      hostId,
      captureId: randomUUID(),
      partyChoice: { kind: "new" as const },
      locale: "en" as const,
      rawMessage: "Invite Cedar family for a weekend",
    }));
    try {
      const outcomes = await Promise.allSettled(
        tasks.map((task) =>
          runAgentTask(task, {
            ...deps,
            model: new TaskScriptedModel(task, deps),
          }),
        ),
      );
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") throw outcome.reason;
        expect(outcome.value.status).toBe("completed");
      }
      const rows = await db<
        { id: string; family_name: string }[]
      >`select p.id, p.family_name from public.parties p
        join public.invitations i on i.party_id=p.id and i.home_id=p.home_id where p.home_id=${home.homeId} order by p.id`;
      expect(rows.map((row) => row.family_name)).toEqual([
        "Cedar family",
        "Cedar family",
      ]);
      expect(rows[0]!.id).not.toBe(rows[1]!.id);
      const returning = {
        ...tasks[0]!,
        captureId: randomUUID(),
        rawMessage: "Invite other guests for a weekend",
        partyChoice: { kind: "returning" as const, partyId: rows[1]!.id },
      };
      const result = await runAgentTask(returning, {
        ...deps,
        model: new TaskScriptedModel(returning, deps),
      });
      const [captured] =
        await db`select i.party_id, p.family_name from public.invitations i join public.parties p on p.id=i.party_id
        join public.audit_events ae on ae.payload->>'invitationId'=i.id::text and ae.home_id=i.home_id
        where ae.run_id=${result.runId} and ae.kind='tool_call' and ae.payload->>'name'='capture_invitation'`;
      expect(captured).toEqual({
        party_id: rows[1]!.id,
        family_name: "Cedar family",
      });
    } finally {
      await home.cleanup();
    }
  });

  it("preserves the application roles and denies anonymous or signed-in browser roles party access", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      for (const operation of ["read", "write"] as const) {
        await expect(
          db.begin(async (tx) => {
            await tx`set local role ${tx(role)}`;
            if (operation === "read")
              return tx`select id from public.parties limit 0`;
            return tx`update public.parties set family_name=family_name where false`;
          }),
        ).rejects.toMatchObject({ code: "42501" });
      }
    }
    for (const role of ["layalga_web_runtime", "layalga_agent_runtime"]) {
      const [privileges] =
        await db`select has_table_privilege(${role}, 'public.parties','select') as read,
        has_table_privilege(${role}, 'public.parties','insert') as create,
        has_table_privilege(${role}, 'public.parties','update') as change,
        has_table_privilege(${role}, 'public.parties','delete') as remove,
        has_table_privilege(${role}, 'public.parties','truncate') as truncate`;
      expect(privileges).toEqual({
        read: true,
        create: true,
        change: true,
        remove: true,
        truncate: false,
      });
    }
  });

  it("backfills upcoming booked links without changing revoked, cancelled or unbooked access", async () => {
    const rollback = new Error("Rollback access migration probe");
    const migration = readFileSync(
      new URL(
        "../../../supabase/migrations/20260905000100_invitation_stay_access.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await expect(
      db.begin(async (transaction) => {
        const [home] = await transaction<{ id: string }[]>`
        insert into public.homes (name, timezone)
        values (${`Access migration ${randomUUID()}`}, 'Europe/Madrid') returning id
      `;
        const [host] = await transaction<{ id: string }[]>`
        insert into public.hosts (home_id, display_name, locale)
        values (${home!.id}, 'Host', 'en') returning id
      `;
        const [party] = await transaction<{ id: string }[]>`
        insert into public.parties (home_id, family_name, locale)
        values (${home!.id}, 'Migration family', 'en') returning id
      `;
        for (const kind of [
          "booked",
          "revoked",
          "cancelled",
          "unbooked",
          "linkless",
          "unbounded",
        ]) {
          const [invitation] = await transaction<{ id: string }[]>`
          insert into public.invitations
            (home_id, host_id, party_id, raw_message, status, link_token, link_token_expires_at, link_token_revoked_at)
          values (${home!.id}, ${host!.id}, ${party!.id}, ${kind},
            ${kind === "cancelled" ? "cancelled" : "sent"}, ${kind === "linkless" ? null : randomUUID()},
            ${kind === "linkless" ? null : "2026-08-01T00:00:00Z"}::timestamptz,
            ${kind === "revoked" ? "2026-07-01T00:00:00Z" : null}::timestamptz)
          returning id
        `;
          if (kind !== "unbooked")
            await transaction`
          insert into public.visits (home_id, party_id, invitation_id, stay, adults, status)
          values (${home!.id}, ${party!.id}, ${invitation!.id},
            daterange('2030-01-10', ${kind === "unbounded" ? null : "2030-01-15"}::date, '[)'), 2, 'confirmed')
        `;
          if (kind === "linkless")
            await extendInvitationAccessForStay(
              transaction,
              invitation!.id,
              "2030-01-15",
            );
        }
        await transaction.unsafe(migration);
        const invitations = await transaction<
          { raw_message: string; link_token_expires_at: Date | null }[]
        >`
        select raw_message, link_token_expires_at from public.invitations where home_id = ${home!.id}
      `;
        for (const invitation of invitations) {
          expect(invitation.link_token_expires_at?.toISOString() ?? null).toBe(
            invitation.raw_message === "linkless"
              ? null
              : invitation.raw_message === "booked"
                ? "2030-01-22T00:00:00.000Z"
                : "2026-08-01T00:00:00.000Z",
          );
        }
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("reissues a link through the booked checkout grace without reviving cancelled invitations", async () => {
    const [home] = await db<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Future access ${randomUUID()}`}, 'Europe/Madrid') returning id
    `;
    const [host] = await db<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home!.id}, 'Host', 'en') returning id
    `;
    const secret = "future-invitation-test-secret";
    try {
      const invitation = await captureInvitation(db, {
        homeId: home!.id,
        hostId: host!.id,
        partyName: "Future family",
        partyLocale: "en",
        rawMessage: "Visit next season",
        tokenSecret: secret,
        appUrl: "https://example.test",
        now: new Date("2026-09-05T00:00:00Z"),
      });
      await db`
        insert into public.rooms (home_id, name, beds, guest_label, floor_label,
          sleeping_arrangement, maximum_capacity, inventory_state)
        values (${home!.id}, 'Only room', 2, 'Only room', 'Ground', 'Double bed', 2, 'available')
      `;
      const clock = new FakeClock(new Date("2026-09-05T00:00:00Z"));
      const hold = await createTemporaryHold(db, clock, {
        invitationId: invitation.invitationId,
        stay: ["2026-12-10", "2026-12-15"],
        adults: 2,
      });
      await confirmVisit(db, clock, hold.visitId);
      const originalToken = new URL(invitation.guestLink).pathname
        .split("/")
        .at(-1)!;
      expect(
        (
          await findInvitationByToken(db, originalToken, secret)
        )?.linkTokenExpiresAt?.toISOString(),
      ).toBe("2026-12-22T00:00:00.000Z");
      await rescheduleVisit(db, clock, {
        visitId: hold.visitId,
        stay: ["2027-01-10", "2027-01-15"],
      });
      expect(
        (
          await findInvitationByToken(db, originalToken, secret)
        )?.linkTokenExpiresAt?.toISOString(),
      ).toBe("2027-01-22T00:00:00.000Z");
      // A shortened stay does not unexpectedly invalidate the original link.
      await db.begin((transaction) =>
        extendInvitationAccessForStay(
          transaction,
          invitation.invitationId,
          "2026-12-15",
        ),
      );
      expect(
        (
          await findInvitationByToken(db, originalToken, secret)
        )?.linkTokenExpiresAt?.toISOString(),
      ).toBe("2027-01-22T00:00:00.000Z");
      await db`update public.invitations set link_token_revoked_at = now() where id = ${invitation.invitationId}`;
      await db.begin((transaction) =>
        extendInvitationAccessForStay(
          transaction,
          invitation.invitationId,
          "2027-02-15",
        ),
      );
      expect(await findInvitationByToken(db, originalToken, secret)).toBeNull();
      const [revoked] = await db<{ link_token_expires_at: Date }[]>`
        select link_token_expires_at from public.invitations where id = ${invitation.invitationId}
      `;
      expect(revoked?.link_token_expires_at.toISOString()).toBe(
        "2027-01-22T00:00:00.000Z",
      );
      const link = await reissueInvitationLink(db, invitation.invitationId, {
        tokenSecret: secret,
        appUrl: "https://example.test",
        now: new Date("2026-09-06T00:00:00Z"),
      });
      const token = new URL(link).pathname.split("/").at(-1)!;
      const found = await findInvitationByToken(db, token, secret);
      expect(found?.linkTokenExpiresAt?.toISOString()).toBe(
        "2027-01-22T00:00:00.000Z",
      );

      await db`update public.invitations set status = 'cancelled' where id = ${invitation.invitationId}`;
      await db.begin((transaction) =>
        extendInvitationAccessForStay(
          transaction,
          invitation.invitationId,
          "2027-03-15",
        ),
      );
      const [cancelled] = await db<{ link_token_expires_at: Date }[]>`
        select link_token_expires_at from public.invitations where id = ${invitation.invitationId}
      `;
      expect(cancelled?.link_token_expires_at.toISOString()).toBe(
        "2027-01-22T00:00:00.000Z",
      );
      expect(await findInvitationByToken(db, token, secret)).toBeNull();
      await expect(
        reissueInvitationLink(db, invitation.invitationId, {
          tokenSecret: secret,
          appUrl: "https://example.test",
        }),
      ).rejects.toThrow("Invitation not found");
    } finally {
      await db`delete from public.homes where id = ${home!.id}`;
    }
  });

  it("stores only the token HMAC and resolves the raw guest token", async () => {
    const suffix = randomUUID();
    const [home] = await db<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Invitation ${suffix}`}, 'Europe/Madrid')
      returning id
    `;
    if (!home) throw new Error("Failed to seed invitation home");
    const [host] = await db<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home.id}, 'Host', 'en')
      returning id
    `;
    if (!host) throw new Error("Failed to seed invitation host");

    const secret = "integration-token-secret";
    try {
      const captured = await captureInvitation(db, {
        homeId: home.id,
        hostId: host.id,
        partyName: "Test family",
        partyLocale: "en",
        rawMessage: "Come for a weekend",
        structured: { adults: 2 },
        tokenSecret: secret,
        appUrl: "https://example.test",
        now: new Date("2099-08-31T10:00:00.000Z"),
      });

      const token = new URL(captured.guestLink).pathname.split("/").at(-1);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(captured.guestLink).toBe(`https://example.test/en/g/${token}`);
      const [stored] = await db<
        { link_token: string; link_token_expires_at: Date }[]
      >`
        select link_token, link_token_expires_at
        from public.invitations where id = ${captured.invitationId}
      `;
      expect(stored?.link_token).not.toBe(token);
      expect(stored?.link_token_expires_at.toISOString()).toBe(
        "2099-09-30T10:00:00.000Z",
      );

      if (!token) throw new Error("Guest link token is missing");
      const found = await findInvitationByToken(db, token, secret);
      expect(found).toMatchObject({
        id: captured.invitationId,
        partyId: captured.partyId,
        partyName: "Test family",
        structured: { adults: 2 },
      });
      expect(await findInvitationByToken(db, token, "wrong-secret")).toBeNull();

      const reissued = await reissueInvitationLink(db, captured.invitationId, {
        now: new Date("2099-09-02T10:00:00.000Z"),
        tokenSecret: secret,
        appUrl: "https://example.test",
      });
      const replacement = new URL(reissued).pathname.split("/").at(-1);
      expect(replacement).not.toBe(token);
      expect(await findInvitationByToken(db, token!, secret)).toBeNull();
      expect(
        await findInvitationByToken(db, replacement!, secret),
      ).toMatchObject({
        id: captured.invitationId,
      });
    } finally {
      await db`delete from public.homes where id = ${home.id}`;
    }
  });

  it("keeps each family invitation link bound to its original invitation", async () => {
    const suffix = randomUUID();
    const [home] = await db<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Stable invitation ${suffix}`}, 'Europe/Madrid')
      returning id
    `;
    if (!home) throw new Error("Failed to seed invitation home");
    const [host] = await db<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home.id}, 'Host', 'en')
      returning id
    `;
    if (!host) throw new Error("Failed to seed invitation host");

    const secret = "stable-invitation-secret";
    try {
      const first = await captureInvitation(db, {
        homeId: home.id,
        hostId: host.id,
        partyName: "Returning family",
        partyLocale: "en",
        rawMessage: "First visit",
        tokenSecret: secret,
        appUrl: "https://example.test",
        now: new Date("2099-08-31T10:00:00.000Z"),
      });
      const second = await captureInvitation(db, {
        returningPartyId: first.partyId,
        homeId: home.id,
        hostId: host.id,
        partyName: "Returning family",
        partyLocale: "en",
        rawMessage: "Second visit",
        tokenSecret: secret,
        appUrl: "https://example.test",
        now: new Date("2099-09-01T10:00:00.000Z"),
      });
      const firstToken = new URL(first.guestLink).pathname.split("/").at(-1)!;
      const secondToken = new URL(second.guestLink).pathname.split("/").at(-1)!;

      expect(await findInvitationByToken(db, firstToken, secret)).toMatchObject(
        {
          id: first.invitationId,
          rawMessage: "First visit",
        },
      );
      expect(
        await findInvitationByToken(db, secondToken, secret),
      ).toMatchObject({
        id: second.invitationId,
        rawMessage: "Second visit",
      });

      const replacementLink = await reissueInvitationLink(
        db,
        second.invitationId,
        {
          tokenSecret: secret,
          appUrl: "https://example.test",
          now: new Date("2099-09-02T10:00:00.000Z"),
        },
      );
      const replacementToken = new URL(replacementLink).pathname
        .split("/")
        .at(-1)!;

      expect(await findInvitationByToken(db, firstToken, secret)).toMatchObject(
        {
          id: first.invitationId,
        },
      );
      expect(await findInvitationByToken(db, secondToken, secret)).toBeNull();
      expect(
        await findInvitationByToken(db, replacementToken, secret),
      ).toMatchObject({ id: second.invitationId });
    } finally {
      await db`delete from public.homes where id = ${home.id}`;
    }
  });
});
