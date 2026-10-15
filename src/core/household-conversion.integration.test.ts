import { readFileSync } from "node:fs";

import postgres, { type TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const db = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  { max: 1, prepare: false },
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261015082739_convert_household_to_real_use.sql",
    import.meta.url,
  ),
  "utf8",
);

const HOME = "00000000-0000-4000-8000-000000000001";
const HOSTS = [
  "00000000-0000-4000-8000-000000000201",
  "00000000-0000-4000-8000-000000000202",
];
const PARTY = "00000000-0000-4000-8000-000000000301";
const INVITATION = "00000000-0000-4000-8000-000000000401";
const ROOM = "00000000-0000-4000-8000-000000000101";

class Rollback extends Error {}

/** Runs `body` against a disposable copy of the household, then rolls back. */
async function inRolledBackTransaction(
  body: (tx: TransactionSql) => Promise<void>,
): Promise<void> {
  await expect(
    db.begin(async (tx) => {
      await tx`delete from public.homes where id = ${HOME}`;
      await body(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

async function seedDemoShape(tx: TransactionSql): Promise<void> {
  await tx`insert into public.homes (id, name, timezone, demo) values (${HOME}, 'Casa Ayalga', 'Europe/Madrid', true)`;
  for (const [index, hostId] of HOSTS.entries()) {
    await tx`insert into public.hosts (id, home_id, display_name, locale) values (${hostId}, ${HOME}, ${`Host ${index}`}, 'en')`;
    await tx`insert into public.host_identity_claims (normalized_email, host_id, home_id) values (${`host${index}@conversion.test`}, ${hostId}, ${HOME})`;
  }
  await tx`insert into public.rooms (id, home_id, name, beds, guest_label, floor_label, sleeping_arrangement, maximum_capacity, inventory_state) values (${ROOM}, ${HOME}, 'Upstairs guest room', 2, 'Guest Room', 'Upper floor', 'One double bed', 2, 'available')`;
  await tx`insert into public.parties (id, home_id, family_name, locale) values (${PARTY}, ${HOME}, 'Familia Vega', 'es')`;
  await tx`insert into public.invitations (id, home_id, host_id, party_id, raw_message) values (${INVITATION}, ${HOME}, ${HOSTS[0]}, ${PARTY}, 'Synthetic invitation')`;
  await tx`insert into public.visits (home_id, party_id, invitation_id, stay, adults, status) values (${HOME}, ${PARTY}, ${INVITATION}, daterange('2026-09-18', '2026-09-21', '[)'), 2, 'confirmed')`;
  const [run] = await tx<{ id: string }[]>`insert into public.runs (home_id, session_id, task, payload, status) values (${HOME}, ${`inv_${INVITATION}`}, 'guest_submit', '{}'::jsonb, 'completed') returning id`;
  await tx`insert into public.audit_events (home_id, run_id, actor, kind) values (${HOME}, ${run!.id}, 'agent', 'tool_call')`;
  await tx`insert into public.audit_events (home_id, actor, kind, payload) values (${HOME}, 'host', 'memory_forgotten', ${tx.json({ partyId: PARTY })})`;
  await tx`insert into public.agent_sessions (key, session_id, data) values (${`inv_${INVITATION}/snapshot`}, ${`inv_${INVITATION}`}, ${Buffer.from("{}")})`;
  await tx`insert into public.private_room_blocks (home_id, stay, public_label, created_by_host_id, idempotency_key, request_hash) values (${HOME}, daterange('2026-09-22', '2026-09-24', '[)'), 'Family use', ${HOSTS[0]}, 'conversion-test', 'hash')`;
  await tx`insert into public.demo_clock (home_id, now, enabled) values (${HOME}, '2026-09-07T10:00:00+02:00', true)`;
}

async function counts(tx: TransactionSql) {
  const [row] = await tx<
    {
      demo: boolean;
      hosts: number;
      claims: number;
      rooms: number;
      parties: number;
      invitations: number;
      runs: number;
      audits: number;
      forgotten: number;
      sessions: number;
      blocks: number;
      clocks: number;
    }[]
  >`
    select
      (select demo from public.homes where id = ${HOME}) as demo,
      (select count(*)::int from public.hosts where home_id = ${HOME}) as hosts,
      (select count(*)::int from public.host_identity_claims where home_id = ${HOME}) as claims,
      (select count(*)::int from public.rooms where home_id = ${HOME}) as rooms,
      (select count(*)::int from public.parties where home_id = ${HOME}) as parties,
      (select count(*)::int from public.invitations where home_id = ${HOME}) as invitations,
      (select count(*)::int from public.runs where home_id = ${HOME}) as runs,
      (select count(*)::int from public.audit_events where home_id = ${HOME} and kind <> 'memory_forgotten') as audits,
      (select count(*)::int from public.audit_events where home_id = ${HOME} and kind = 'memory_forgotten') as forgotten,
      (select count(*)::int from public.agent_sessions where session_id = ${`inv_${INVITATION}`}) as sessions,
      (select count(*)::int from public.private_room_blocks where home_id = ${HOME}) as blocks,
      (select count(*)::int from public.demo_clock where home_id = ${HOME}) as clocks
  `;
  return row;
}

describe("household conversion migration", () => {
  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("converts the demo household in place and keeps its hosts and claims", async () => {
    await inRolledBackTransaction(async (tx) => {
      await seedDemoShape(tx);
      await tx.unsafe(migration);
      expect(await counts(tx)).toEqual({
        demo: false,
        hosts: 2,
        claims: 2,
        rooms: 0,
        parties: 0,
        invitations: 0,
        runs: 0,
        audits: 0,
        forgotten: 1,
        sessions: 0,
        blocks: 0,
        clocks: 0,
      });
      // Applying it again is a no-op.
      await tx.unsafe(migration);
      expect((await counts(tx))?.hosts).toBe(2);
    });
  });

  it("does nothing when the household is absent", async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx.unsafe(migration);
      const [home] = await tx<{ count: number }[]>`
        select count(*)::int as count from public.homes where id = ${HOME}
      `;
      expect(home?.count).toBe(0);
    });
  });

  it("leaves a real (non-demo) household untouched", async () => {
    await inRolledBackTransaction(async (tx) => {
      await seedDemoShape(tx);
      await tx`update public.homes set demo = false where id = ${HOME}`;
      await tx.unsafe(migration);
      expect(await counts(tx)).toMatchObject({ rooms: 1, parties: 1, runs: 1 });
    });
  });
});
