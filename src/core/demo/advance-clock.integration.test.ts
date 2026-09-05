import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { advanceDemoClock, DemoClockError } from "./advance-clock";
import { DbDemoClock } from "../clock";
import { runDueJobs } from "../reconfirmation/jobs";

const db = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  { prepare: false, max: 5 },
);
afterAll(() => db.end({ timeout: 5 }));
async function fixture({
  demo = true,
  stay = "2026-09-19",
  due = "2026-09-16T07:00:00Z",
} = {}) {
  const homeId = randomUUID(),
    hostId = randomUUID(),
    partyId = randomUUID(),
    invitationId = randomUUID(),
    visitId = randomUUID(),
    jobId = randomUUID();
  await db`insert into public.homes(id,name,timezone,demo) values(${homeId},${homeId},'Europe/Madrid',${demo})`;
  await db`insert into public.hosts(id,home_id,display_name,locale) values(${hostId},${homeId},'Host','en')`;
  await db`insert into public.parties(id,home_id,family_name,locale) values(${partyId},${homeId},'Synthetic Oteros','en')`;
  await db`insert into public.invitations(id,home_id,host_id,party_id,raw_message) values(${invitationId},${homeId},${hostId},${partyId},'Synthetic')`;
  await db`insert into public.visits(id,home_id,party_id,invitation_id,stay,adults,status,confirmed_at) values(${visitId},${homeId},${partyId},${invitationId},daterange(${stay}::date,${stay}::date+2,'[)'),2,'confirmed','2026-09-01T10:00:00Z')`;
  await db`insert into public.demo_clock(home_id,now,enabled) values(${homeId},'2026-09-01T10:00:00Z',true)`;
  await db`insert into public.scheduled_jobs(id,home_id,visit_id,kind,due_at,available_at,status) values(${jobId},${homeId},${visitId},'reconfirm_chase',${due},${due},'scheduled')`;
  return { homeId, hostId, partyId, invitationId, visitId, jobId };
}
describe("semantic demo clock", () => {
  it.each([
    ["2026-09-19", "2026-09-16T07:00:00Z"],
    ["2027-11-20", "2027-11-17T08:00:00Z"],
  ])(
    "runs the actual chase/escalation cycle for arrival %s",
    async (stay, due) => {
      const f = await fixture({ stay, due });
      try {
        expect(
          await advanceDemoClock(db, { homeId: f.homeId, action: "chase" }),
        ).toEqual({ now: new Date(due).toISOString(), outcome: "advanced" });
        await runDueJobs(
          db,
          await DbDemoClock.load(f.homeId, db),
          { run: async () => {} },
          f.homeId,
        );
        expect(
          (await advanceDemoClock(db, { homeId: f.homeId, action: "chase" }))
            .outcome,
        ).toBe("no_eligible");
        const escalation = await advanceDemoClock(db, {
          homeId: f.homeId,
          action: "escalation",
        });
        expect(escalation.now).toBe(
          new Date(new Date(due).getTime() + 86_400_000).toISOString(),
        );
        await runDueJobs(
          db,
          await DbDemoClock.load(f.homeId, db),
          { run: async () => {} },
          f.homeId,
        );
        expect(
          (
            await advanceDemoClock(db, {
              homeId: f.homeId,
              action: "escalation",
            })
          ).outcome,
        ).toBe("no_eligible");
        const notices = await db<
          { kind: string }[]
        >`select kind from public.notifications where home_id=${f.homeId} order by kind`;
        expect(notices.map((n) => n.kind)).toEqual([
          "reconfirm_chase",
          "reconfirm_escalation",
        ]);
      } finally {
        await db`delete from public.homes where id=${f.homeId}`;
      }
    },
  );
  it("advances to the persisted delivery retry after escalation already changed the visit", async () => {
    const f = await fixture();
    try {
      await advanceDemoClock(db, { homeId: f.homeId, action: "chase" });
      await runDueJobs(
        db,
        await DbDemoClock.load(f.homeId, db),
        { run: async () => {} },
        f.homeId,
      );
      await advanceDemoClock(db, { homeId: f.homeId, action: "escalation" });
      await expect(
        runDueJobs(
          db,
          await DbDemoClock.load(f.homeId, db),
          {
            run: async () => {
              throw new Error("Synthetic worker failure before notification");
            },
          },
          f.homeId,
        ),
      ).rejects.toBeInstanceOf(AggregateError);
      const [visit] = await db<
        { status: string }[]
      >`select status from public.visits where id=${f.visitId}`;
      expect(visit?.status).toBe("escalated");
      const [retry] = await db<
        { available_at: Date; attempt_count: number }[]
      >`select available_at, attempt_count from public.scheduled_jobs where visit_id=${f.visitId} and kind='reconfirm_escalate'`;
      expect(retry?.attempt_count).toBe(1);
      expect(
        await advanceDemoClock(db, { homeId: f.homeId, action: "escalation" }),
      ).toEqual({
        now: new Date(retry!.available_at).toISOString(),
        outcome: "advanced",
      });
      await runDueJobs(
        db,
        await DbDemoClock.load(f.homeId, db),
        { run: async () => {} },
        f.homeId,
      );
      expect(
        (await advanceDemoClock(db, { homeId: f.homeId, action: "escalation" }))
          .outcome,
      ).toBe("no_eligible");
      const notices =
        await db`select id from public.notifications where home_id=${f.homeId} and kind='reconfirm_escalation'`;
      expect(notices).toHaveLength(1);
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });
  it("respects retry availability and never moves backward for already-due work", async () => {
    const f = await fixture();
    try {
      await db`update public.scheduled_jobs set available_at='2026-09-16T07:05:00Z' where id=${f.jobId}`;
      expect(
        (await advanceDemoClock(db, { homeId: f.homeId, action: "chase" })).now,
      ).toBe("2026-09-16T07:05:00.000Z");
      expect(
        (await advanceDemoClock(db, { homeId: f.homeId, action: "chase" }))
          .outcome,
      ).toBe("already_due");
      await expect(
        advanceDemoClock(db, { homeId: f.homeId, now: "2026-09-01T10:00:00Z" }),
      ).rejects.toMatchObject({ code: "backward_clock" });
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });
  it.each([
    "cancelled",
    "exhausted",
    "running",
    "past_arrival",
    "withdrawn",
    "obsolete_cycle",
  ])("does not advance for %s jobs", async (reason) => {
    const f = await fixture();
    try {
      if (reason === "cancelled")
        await db`update public.visits set status='cancelled' where id=${f.visitId}`;
      if (reason === "withdrawn")
        await db`update public.invitations set status='cancelled' where id=${f.invitationId}`;
      if (reason === "exhausted")
        await db`update public.scheduled_jobs set attempt_count=3 where id=${f.jobId}`;
      if (reason === "running")
        await db`update public.scheduled_jobs set status='running',claimed_at='2026-09-01T10:00:00Z' where id=${f.jobId}`;
      if (reason === "past_arrival")
        await db`update public.scheduled_jobs set available_at='2026-09-19T07:00:00Z' where id=${f.jobId}`;
      if (reason === "obsolete_cycle")
        await db`update public.visits set confirmed_at='2026-09-18T10:00:00Z' where id=${f.visitId}`;
      expect(
        await advanceDemoClock(db, { homeId: f.homeId, action: "chase" }),
      ).toEqual({ now: "2026-09-01T10:00:00.000Z", outcome: "no_eligible" });
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });
  it("keeps custom forward clock payloads while rejecting real homes and invalid dates", async () => {
    const f = await fixture(),
      real = await fixture({ demo: false });
    try {
      expect(
        await advanceDemoClock(db, {
          homeId: f.homeId,
          now: "2026-09-02T10:00:00Z",
        }),
      ).toEqual({ now: "2026-09-02T10:00:00.000Z", outcome: "advanced" });
      await expect(
        advanceDemoClock(db, { homeId: real.homeId, action: "chase" }),
      ).rejects.toBeInstanceOf(DemoClockError);
      await expect(
        advanceDemoClock(db, { homeId: f.homeId, now: "invalid" }),
      ).rejects.toMatchObject({ code: "invalid_clock" });
    } finally {
      await db`delete from public.homes where id in (${f.homeId},${real.homeId})`;
    }
  });
});
