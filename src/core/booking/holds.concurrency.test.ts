import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FakeClock } from "../clock";
import {
  cancelVisit,
  confirmVisit,
  createTemporaryHold,
  rescheduleVisit,
  RoomUnavailableError,
} from "./holds";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const db = postgres(connectionUrl, { max: 12, prepare: false });

interface Fixture {
  homeId: string;
  invitationIds: [string, string];
}

async function seedFixture(sql: Sql): Promise<Fixture> {
  const suffix = randomUUID();
  const [home] = await sql<{ id: string }[]>`
    insert into public.homes (name, timezone)
    values (${`Concurrency ${suffix}`}, 'Europe/Madrid')
    returning id
  `;
  if (!home) throw new Error("Failed to seed the concurrency home");

  await sql`
    insert into public.rooms (home_id, name, beds)
    values (${home.id}, 'Only room', 2)
  `;
  const [host] = await sql<{ id: string }[]>`
    insert into public.hosts (home_id, display_name, locale)
    values (${home.id}, 'Host', 'en')
    returning id
  `;
  if (!host) throw new Error("Failed to seed the concurrency host");

  const invitationIds: string[] = [];
  for (const partyNumber of [1, 2]) {
    const [party] = await sql<{ id: string }[]>`
      insert into public.parties (home_id, family_name, locale, link_token)
      values (
        ${home.id},
        ${`Party ${partyNumber}`},
        'en',
        ${`test-${randomUUID()}`}
      )
      returning id
    `;
    if (!party) throw new Error("Failed to seed a concurrency party");

    const [invitation] = await sql<{ id: string }[]>`
      insert into public.invitations (home_id, host_id, party_id, raw_message)
      values (${home.id}, ${host.id}, ${party.id}, 'Concurrency fixture')
      returning id
    `;
    if (!invitation) throw new Error("Failed to seed a concurrency invitation");
    invitationIds.push(invitation.id);
  }

  return { homeId: home.id, invitationIds: invitationIds as [string, string] };
}

async function runRace(lockHome: boolean): Promise<void> {
  const fixture = await seedFixture(db);
  const clock = new FakeClock(new Date("2026-09-01T10:00:00.000Z"));
  const input = {
    stay: ["2026-10-02", "2026-10-04"] as const,
    adults: 2,
    children: 0,
    pets: 0,
    specialRequests: [],
  };

  try {
    const results = await Promise.allSettled(
      fixture.invitationIds.map((invitationId) =>
        createTemporaryHold(
          db,
          clock,
          { ...input, invitationId },
          { lockHome },
        ),
      ),
    );

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(RoomUnavailableError);

    const rows = await db<{ count: number }[]>`
      select count(*)::integer as count
      from public.visit_rooms vr
      join public.visits v on v.id = vr.visit_id
      where v.home_id = ${fixture.homeId}
    `;
    expect(rows[0]?.count).toBe(1);
  } finally {
    await db`delete from public.homes where id = ${fixture.homeId}`;
  }
}

describe("createTemporaryHold concurrency", () => {
  beforeAll(async () => {
    const [schema] = await db<{ core: string | null }[]>`
      select to_regclass('public.visit_rooms')::text as core
    `;
    if (!schema?.core) {
      throw new Error(
        "Local Supabase schema is missing; run `supabase db reset` first",
      );
    }
  });

  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("serializes twenty races for the final room", async () => {
    for (let iteration = 0; iteration < 20; iteration += 1) {
      await runRace(true);
    }
  }, 30_000);

  it("lets the exclusion constraint reject a race without the home lock", async () => {
    await runRace(false);
  });

  it("confirms, reschedules, and cancels a held visit atomically", async () => {
    const fixture = await seedFixture(db);
    const clock = new FakeClock(new Date("2026-09-01T10:00:00.000Z"));

    try {
      const hold = await createTemporaryHold(db, clock, {
        invitationId: fixture.invitationIds[0],
        stay: ["2026-10-02", "2026-10-04"],
        adults: 2,
      });
      const confirmed = await confirmVisit(db, clock, hold.visitId);
      expect(confirmed.status).toBe("confirmed");

      const rescheduled = await rescheduleVisit(db, clock, {
        visitId: hold.visitId,
        stay: ["2026-10-09", "2026-10-11"],
      });
      expect(rescheduled.status).toBe("confirmed");

      const activeJobs = await db<{ count: number }[]>`
        select count(*)::integer as count
        from public.scheduled_jobs
        where visit_id = ${hold.visitId}
          and status = 'scheduled'
      `;
      expect(activeJobs[0]?.count).toBe(1);

      await cancelVisit(db, hold.visitId);
      const [cancelled] = await db<
        { status: string; rooms: number; jobs: number }[]
      >`
        select
          v.status,
          (select count(*)::integer from public.visit_rooms where visit_id = v.id) as rooms,
          (
            select count(*)::integer
            from public.scheduled_jobs
            where visit_id = v.id and status in ('scheduled', 'running')
          ) as jobs
        from public.visits v
        where v.id = ${hold.visitId}
      `;
      expect(cancelled).toEqual({ status: "cancelled", rooms: 0, jobs: 0 });
    } finally {
      await db`delete from public.homes where id = ${fixture.homeId}`;
    }
  });
});
