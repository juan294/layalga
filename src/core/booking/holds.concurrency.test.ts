import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FakeClock } from "../clock";
import type { JobScheduler } from "../reconfirmation/jobs";
import {
  createPrivateRoomBlock,
  RoomOperationConflictError,
} from "../rooms/operations";
import {
  cancelVisit,
  confirmVisit,
  createTemporaryHold,
  expireTemporaryHolds,
  rescheduleVisit,
  RoomUnavailableError,
} from "./holds";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const db = postgres(connectionUrl, { max: 12, prepare: false });

interface Fixture {
  homeId: string;
  hostId: string;
  invitationIds: [string, string];
  roomId: string;
}

async function seedFixture(sql: Sql): Promise<Fixture> {
  const suffix = randomUUID();
  const [home] = await sql<{ id: string }[]>`
    insert into public.homes (name, timezone)
    values (${`Concurrency ${suffix}`}, 'Europe/Madrid')
    returning id
  `;
  if (!home) throw new Error("Failed to seed the concurrency home");

  const [room] = await sql<{ id: string }[]>`
    insert into public.rooms (
      home_id, name, beds, guest_label, floor_label, sleeping_arrangement,
      maximum_capacity, inventory_state
    ) values (${home.id}, 'Only room', 2, 'Only room', 'Ground', 'Double bed', 2, 'available')
    returning id
  `;
  if (!room) throw new Error("Failed to seed the concurrency room");
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

  return {
    homeId: home.id,
    hostId: host.id,
    invitationIds: invitationIds as [string, string],
    roomId: room.id,
  };
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
    const scheduled: string[] = [];
    const cancelledRefs: string[] = [];
    const scheduler: JobScheduler = {
      async schedule(job) {
        scheduled.push(job.id);
        return `external-${job.id}`;
      },
      async cancel(externalRef) {
        cancelledRefs.push(externalRef);
      },
    };

    try {
      const hold = await createTemporaryHold(db, clock, {
        invitationId: fixture.invitationIds[0],
        stay: ["2026-10-02", "2026-10-04"],
        adults: 2,
      });
      const confirmed = await confirmVisit(
        db,
        clock,
        hold.visitId,
        undefined,
        scheduler,
      );
      expect(confirmed.status).toBe("confirmed");
      const confirmedAgain = await confirmVisit(
        db,
        clock,
        hold.visitId,
        undefined,
        scheduler,
      );
      expect(confirmedAgain).toEqual(confirmed);
      expect(scheduled).toHaveLength(1);

      const rescheduled = await rescheduleVisit(
        db,
        clock,
        {
          visitId: hold.visitId,
          stay: ["2026-10-09", "2026-10-11"],
        },
        scheduler,
      );
      expect(rescheduled.status).toBe("confirmed");
      expect(scheduled).toHaveLength(2);
      expect(cancelledRefs).toEqual([`external-${scheduled[0]}`]);

      const rescheduledAgain = await rescheduleVisit(
        db,
        clock,
        {
          visitId: hold.visitId,
          stay: ["2026-10-09", "2026-10-11"],
        },
        scheduler,
      );
      expect(rescheduledAgain).toEqual(rescheduled);
      expect(scheduled).toHaveLength(2);

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

  it("expires a stale hold and releases its room", async () => {
    const fixture = await seedFixture(db);
    const clock = new FakeClock(new Date("2026-09-01T10:00:00.000Z"));
    try {
      const hold = await createTemporaryHold(db, clock, {
        invitationId: fixture.invitationIds[0],
        stay: ["2026-10-02", "2026-10-04"],
        adults: 2,
      });
      clock.advance(48 * 60 * 60 * 1_000 + 1);

      await expect(confirmVisit(db, clock, hold.visitId)).rejects.toThrow(
        "expired",
      );
      expect(await expireTemporaryHolds(db, clock)).toBe(1);
      expect(await expireTemporaryHolds(db, clock)).toBe(0);

      const [row] = await db<{ status: string; rooms: number }[]>`
        select v.status,
          (select count(*)::integer from public.visit_rooms where visit_id = v.id) as rooms
        from public.visits v where v.id = ${hold.visitId}
      `;
      expect(row).toEqual({ status: "cancelled", rooms: 0 });

      await expect(
        createTemporaryHold(db, clock, {
          invitationId: fixture.invitationIds[1],
          stay: ["2026-10-02", "2026-10-04"],
          adults: 2,
        }),
      ).resolves.toMatchObject({ status: "hold" });
    } finally {
      await db`delete from public.homes where id = ${fixture.homeId}`;
    }
  });

  it("resets reconfirmation state when a visit is rescheduled", async () => {
    const fixture = await seedFixture(db);
    const clock = new FakeClock(new Date("2026-09-01T10:00:00.000Z"));
    try {
      const hold = await createTemporaryHold(db, clock, {
        invitationId: fixture.invitationIds[0],
        stay: ["2026-10-02", "2026-10-04"],
        adults: 2,
      });
      await confirmVisit(db, clock, hold.visitId);
      await db`
        update public.visits
        set status = 'escalated',
          reconfirm_requested_at = '2026-09-29T10:00:00Z',
          reconfirmed_at = '2026-09-29T11:00:00Z',
          escalated_at = '2026-09-30T10:00:00Z'
        where id = ${hold.visitId}
      `;

      const moved = await rescheduleVisit(db, clock, {
        visitId: hold.visitId,
        stay: ["2026-10-09", "2026-10-11"],
      });
      expect(moved.status).toBe("confirmed");
      const [row] = await db<
        {
          status: string;
          reconfirm_requested_at: Date | null;
          reconfirmed_at: Date | null;
          escalated_at: Date | null;
        }[]
      >`
        select status, reconfirm_requested_at, reconfirmed_at, escalated_at
        from public.visits where id = ${hold.visitId}
      `;
      expect(row).toEqual({
        status: "confirmed",
        reconfirm_requested_at: null,
        reconfirmed_at: null,
        escalated_at: null,
      });
    } finally {
      await db`delete from public.homes where id = ${fixture.homeId}`;
    }
  });

  it("expires other stale holds inside a confirmation transaction", async () => {
    const fixture = await seedFixture(db);
    const firstClock = new FakeClock(new Date("2026-09-01T10:00:00.000Z"));

    try {
      const stale = await createTemporaryHold(db, firstClock, {
        invitationId: fixture.invitationIds[0],
        stay: ["2026-10-02", "2026-10-04"],
        adults: 1,
      });
      await db`
        insert into public.rooms (
          home_id, name, beds, guest_label, floor_label, sleeping_arrangement,
          maximum_capacity, inventory_state
        ) values (${fixture.homeId}, 'Second room', 2, 'Second room', 'Upper', 'Double bed', 2, 'available')
      `;
      const activeClock = new FakeClock(
        new Date(firstClock.now().getTime() + 47 * 60 * 60 * 1_000),
      );
      const active = await createTemporaryHold(db, activeClock, {
        invitationId: fixture.invitationIds[1],
        stay: ["2026-10-02", "2026-10-04"],
        adults: 1,
      });
      activeClock.set(
        new Date(firstClock.now().getTime() + 49 * 60 * 60 * 1_000),
      );

      await confirmVisit(db, activeClock, active.visitId);

      const [expired] = await db<{ status: string }[]>`
        select status from public.visits where id = ${stale.visitId}
      `;
      expect(expired?.status).toBe("cancelled");
    } finally {
      await db`delete from public.homes where id = ${fixture.homeId}`;
    }
  });

  it("rechecks and stores an exact room selection", async () => {
    const fixture = await seedFixture(db);
    const clock = new FakeClock(new Date("2026-09-01T10:00:00.000Z"));
    try {
      await db`
        insert into public.rooms (
          home_id, name, beds, guest_label, floor_label, sleeping_arrangement,
          maximum_capacity, inventory_state, display_order
        ) values (${fixture.homeId}, 'Single room', 1, 'Single room', 'Upper', 'Single bed', 1, 'available', -1)
      `;
      const hold = await createTemporaryHold(db, clock, {
        invitationId: fixture.invitationIds[0],
        stay: ["2026-11-02", "2026-11-04"],
        adults: 1,
        roomIds: [fixture.roomId],
      });
      expect(hold.allocation.map(({ id }) => id)).toEqual([fixture.roomId]);

      await expect(
        createTemporaryHold(db, clock, {
          invitationId: fixture.invitationIds[1],
          stay: ["2026-12-02", "2026-12-04"],
          adults: 1,
          roomIds: [fixture.roomId, fixture.roomId],
        }),
      ).rejects.toBeInstanceOf(RoomUnavailableError);
    } finally {
      await db`delete from public.homes where id = ${fixture.homeId}`;
    }
  });

  it("requires host approval for the exact overflow arrangement", async () => {
    const fixture = await seedFixture(db);
    const clock = new FakeClock(new Date("2026-09-01T10:00:00.000Z"));
    try {
      const [overflow] = await db<{ id: string }[]>`
        insert into public.rooms (
          home_id, name, beds, guest_label, floor_label, sleeping_arrangement,
          overflow_arrangement, maximum_capacity, inventory_state, overflow_policy
        ) values (
          ${fixture.homeId}, 'Overflow room', 2, 'Overflow room', 'Lower',
          'One sofa bed', 'One double air mattress', 4, 'available', 'host_approval'
        ) returning id
      `;
      if (!overflow) throw new Error("Failed to create the overflow room");
      const request = {
        invitationId: fixture.invitationIds[0],
        stay: ["2027-01-02", "2027-01-04"] as const,
        adults: 4,
        roomIds: [overflow.id],
        overflowConsent: true,
      };
      await expect(
        createTemporaryHold(db, clock, request),
      ).rejects.toMatchObject({
        name: "RoomOverflowApprovalRequiredError",
        arrangements: ["One double air mattress"],
      });
      await expect(
        createTemporaryHold(db, clock, {
          ...request,
          approvedBy: fixture.hostId,
        }),
      ).resolves.toMatchObject({ status: "hold" });
    } finally {
      await db`delete from public.homes where id = ${fixture.homeId}`;
    }
  });

  it("does not invent overflow consent when capacity changes before confirmation", async () => {
    const fixture = await seedFixture(db);
    const clock = new FakeClock(new Date("2026-09-01T10:00:00.000Z"));
    try {
      const hold = await createTemporaryHold(db, clock, {
        invitationId: fixture.invitationIds[0],
        stay: ["2027-01-12", "2027-01-14"],
        adults: 2,
        roomIds: [fixture.roomId],
      });
      await db`
        update public.rooms
        set beds = 1,
            maximum_capacity = 2,
            overflow_arrangement = 'One folding bed',
            overflow_policy = 'host_approval'
        where id = ${fixture.roomId}
      `;

      await expect(
        confirmVisit(db, clock, hold.visitId, fixture.hostId),
      ).rejects.toBeInstanceOf(RoomUnavailableError);
    } finally {
      await db`delete from public.homes where id = ${fixture.homeId}`;
    }
  });

  it("allows only one winner between a visit and a private block", async () => {
    const fixture = await seedFixture(db);
    const clock = new FakeClock(new Date("2026-09-01T10:00:00.000Z"));
    try {
      const results = await Promise.allSettled([
        createTemporaryHold(db, clock, {
          invitationId: fixture.invitationIds[0],
          stay: ["2027-02-02", "2027-02-04"],
          adults: 2,
          roomIds: [fixture.roomId],
        }),
        createPrivateRoomBlock(db, {
          homeId: fixture.homeId,
          hostId: fixture.hostId,
          roomIds: [fixture.roomId],
          stay: ["2027-02-02", "2027-02-04"],
          publicLabel: "Reserved by host",
          idempotencyKey: `race-${randomUUID()}`,
        }),
      ]);
      expect(
        results.filter(({ status }) => status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      expect(
        rejected?.reason instanceof RoomUnavailableError ||
          rejected?.reason instanceof RoomOperationConflictError,
      ).toBe(true);
    } finally {
      await db`delete from public.homes where id = ${fixture.homeId}`;
    }
  });
});
