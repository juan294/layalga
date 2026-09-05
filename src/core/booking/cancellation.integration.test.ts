import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { FakeClock } from "../clock";
import { withdrawInvitation } from "./cancellation";
import { confirmVisit, createTemporaryHold, rescheduleVisit } from "./holds";
import { runAgentTask } from "@/agent/run-task";
import { ScriptedModel } from "@/agent/scripted-model";
import { NoopScheduler } from "@/agent/deps";
import type {
  Message,
  StreamOptions,
  ModelStreamEvent,
} from "@strands-agents/sdk";

const db = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  { prepare: false, max: 5 },
);
const clock = new FakeClock(new Date("2026-09-01T10:00:00Z"));
afterAll(() => db.end({ timeout: 5 }));

async function fixture() {
  const homeId = randomUUID(),
    hostId = randomUUID(),
    partyId = randomUUID(),
    invitationId = randomUUID();
  await db`insert into public.homes (id, name, timezone) values (${homeId}, ${homeId}, 'Europe/Madrid')`;
  await db`insert into public.hosts (id, home_id, display_name, locale) values (${hostId}, ${homeId}, 'Host', 'en')`;
  await db`insert into public.parties (id, home_id, family_name, locale, link_token) values (${partyId}, ${homeId}, 'Party', 'en', ${randomUUID()})`;
  await db`insert into public.invitations (id, home_id, host_id, party_id, raw_message) values (${invitationId}, ${homeId}, ${hostId}, ${partyId}, 'Visit')`;
  await db`insert into public.rooms (home_id, name, beds, guest_label, floor_label, sleeping_arrangement, maximum_capacity, inventory_state) values (${homeId}, 'Room', 2, 'Room', 'Ground', 'Double', 2, 'available')`;
  return { homeId, hostId, partyId, invitationId };
}

describe("authorized cancellation and withdrawal", () => {
  it("withdraws an in-flight pre-hold request without letting it create a decision later", async () => {
    const f = await fixture();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    class PausedModel extends ScriptedModel {
      override async *stream(
        messages: Message[],
        options?: StreamOptions,
      ): AsyncIterable<ModelStreamEvent> {
        entered();
        await gate;
        yield* super.stream(messages, options);
      }
    }
    try {
      const running = runAgentTask(
        {
          task: "guest_submit",
          homeId: f.homeId,
          invitationId: f.invitationId,
          stay: ["2026-10-02", "2026-10-04"],
          adults: 2,
          children: 0,
          pets: 0,
          notes: "Need a special arrangement",
          locale: "en",
        },
        {
          db,
          clock,
          scheduler: new NoopScheduler(),
          appUrl: "http://localhost:3008",
          locale: "en",
          model: new PausedModel([
            {
              toolUse: {
                name: "create_temporary_hold",
                input: {
                  invitationId: f.invitationId,
                  stay: ["2026-10-02", "2026-10-04"],
                  adults: 2,
                },
              },
            },
            { text: "Stopped" },
          ]),
        },
      );
      const terminal = running.catch(() => null);
      await started;
      await withdrawInvitation(db, {
        ...f,
        actor: { kind: "guest", partyId: f.partyId },
        expectedVisitId: null,
        expectedStay: null,
      });
      release();
      await terminal;
      const [counts] =
        await db`select (select count(*)::int from public.visits where home_id = ${f.homeId}) visits, (select count(*)::int from public.pending_decisions where home_id = ${f.homeId} and status = 'pending') pending`;
      expect(counts).toMatchObject({ visits: 0, pending: 0 });
    } finally {
      release();
      await db`delete from public.homes where id = ${f.homeId}`;
      await db`delete from public.agent_sessions where session_id = ${`inv_${f.invitationId}`}`;
    }
  });

  it("retires queued tick runs and quarantined reminders", async () => {
    const f = await fixture();
    const stay = ["2026-10-02", "2026-10-04"] as const;
    try {
      const visit = await createTemporaryHold(db, clock, {
        invitationId: f.invitationId,
        adults: 2,
        stay,
      });
      await confirmVisit(db, clock, visit.visitId);
      const [job] =
        await db`update public.scheduled_jobs set status = 'quarantined' where visit_id = ${visit.visitId} returning id`;
      const runId = randomUUID();
      await db`insert into public.runs (id, home_id, session_id, task, status, payload) values (${runId}, ${f.homeId}, ${`tick_${job!.id}`}, 'tick', 'queued', ${JSON.stringify({ task: "tick", homeId: f.homeId, jobId: job!.id })}::jsonb)`;
      await withdrawInvitation(db, {
        ...f,
        actor: { kind: "guest", partyId: f.partyId },
        expectedVisitId: visit.visitId,
        expectedStay: stay,
      });
      const [run] =
        await db`select status from public.runs where id = ${runId}`;
      const [cancelledJob] =
        await db`select status from public.scheduled_jobs where id = ${job!.id}`;
      expect(run?.status).toBe("failed");
      expect(cancelledJob?.status).toBe("cancelled");
      await expect(
        runAgentTask(
          { task: "tick", homeId: f.homeId, jobId: job!.id },
          {
            db,
            clock,
            scheduler: new NoopScheduler(),
            appUrl: "http://localhost:3008",
            locale: "en",
            model: new ScriptedModel([]),
          },
        ),
      ).rejects.toThrow("Scheduled job");
    } finally {
      await db`delete from public.homes where id = ${f.homeId}`;
    }
  });
  it("lets the model prepare cancellation for semantic wording without changing the visit", async () => {
    const f = await fixture();
    try {
      const visit = await createTemporaryHold(db, clock, {
        invitationId: f.invitationId,
        adults: 2,
        stay: ["2026-10-02", "2026-10-04"],
      });
      await confirmVisit(db, clock, visit.visitId);
      const result = await runAgentTask(
        {
          task: "guest_change",
          homeId: f.homeId,
          visitId: visit.visitId,
          message: "An unexpected family commitment means our plans are off.",
          locale: "en",
        },
        {
          db,
          clock,
          scheduler: new NoopScheduler(),
          appUrl: "http://localhost:3008",
          locale: "en",
          model: new ScriptedModel([
            {
              toolUse: {
                name: "prepare_cancellation",
                input: { visitId: visit.visitId },
              },
            },
            {
              text: "Review and confirm cancellation in your invitation. Nothing has changed.",
            },
          ]),
        },
      );
      expect(result.status).toBe("completed");
      const [row] =
        await db`select status from public.visits where id = ${visit.visitId}`;
      expect(row?.status).toBe("confirmed");
      const [audit] =
        await db`select count(*)::int count from public.audit_events where run_id = ${result.runId} and payload->>'name' = 'prepare_cancellation'`;
      expect(audit?.count).toBe(1);
    } finally {
      await db`delete from public.homes where id = ${f.homeId}`;
      await db`delete from public.agent_sessions where session_id = ${`inv_${f.invitationId}`}`;
    }
  });
  it("retires an invitation decision before a hold exists and blocks stale booking", async () => {
    const f = await fixture();
    try {
      const runId = randomUUID();
      await db`insert into public.runs (id, home_id, session_id, task, status, payload) values (${runId}, ${f.homeId}, ${`inv_${f.invitationId}`}, 'guest_submit', 'interrupted', ${JSON.stringify({ invitationId: f.invitationId })}::jsonb)`;
      await db`insert into public.pending_decisions (home_id, run_id, agent_session_id, interrupt_id, interrupt_name, reason, status, decided_by_host_id) values (${f.homeId}, ${runId}, ${`inv_${f.invitationId}`}, 'approval', 'host_decision', '{}', 'approved', ${f.hostId})`;
      await withdrawInvitation(db, {
        ...f,
        actor: { kind: "guest", partyId: f.partyId },
        expectedVisitId: null,
        expectedStay: null,
      });
      await expect(
        createTemporaryHold(db, clock, {
          invitationId: f.invitationId,
          adults: 2,
          stay: ["2026-10-02", "2026-10-04"],
          approvedBy: f.hostId,
        }),
      ).rejects.toThrow();
      const [row] =
        await db`select status from public.pending_decisions where run_id = ${runId}`;
      expect(row?.status).toBe("cancelled");
      const [run] =
        await db`select status from public.runs where id = ${runId}`;
      expect(run?.status).toBe("failed");
    } finally {
      await db`delete from public.homes where id = ${f.homeId}`;
    }
  });

  it("cancels rooms and follow-ups exactly once and rejects foreign authority", async () => {
    const f = await fixture();
    const stay = ["2026-10-02", "2026-10-04"] as const;
    try {
      const visit = await createTemporaryHold(db, clock, {
        invitationId: f.invitationId,
        adults: 2,
        stay,
      });
      await confirmVisit(db, clock, visit.visitId);
      const input = {
        ...f,
        actor: { kind: "host" as const, hostId: f.hostId },
        expectedVisitId: visit.visitId,
        expectedStay: stay,
      };
      await expect(
        withdrawInvitation(db, {
          ...input,
          actor: { kind: "guest", partyId: randomUUID() },
        }),
      ).rejects.toThrow();
      await Promise.all([
        withdrawInvitation(db, input),
        withdrawInvitation(db, input),
      ]);
      const [row] =
        await db`select status, calendar_sequence, (select count(*)::int from public.visit_rooms where visit_id = v.id) rooms, (select count(*)::int from public.scheduled_jobs where visit_id = v.id and status in ('running','scheduled')) jobs from public.visits v where id = ${visit.visitId}`;
      expect(row).toMatchObject({
        status: "cancelled",
        calendar_sequence: 1,
        rooms: 0,
        jobs: 0,
      });
      const [audit] =
        await db`select count(*)::int count from public.audit_events where home_id = ${f.homeId} and kind = 'invitation_cancelled'`;
      expect(audit?.count).toBe(1);
      await expect(
        rescheduleVisit(db, clock, {
          visitId: visit.visitId,
          stay: ["2026-11-02", "2026-11-04"],
        }),
      ).rejects.toThrow("cancelled");
    } finally {
      await db`delete from public.homes where id = ${f.homeId}`;
    }
  });

  it("requires a fresh review if a visit was created or moved after the preview", async () => {
    const f = await fixture();
    try {
      const visit = await createTemporaryHold(db, clock, {
        invitationId: f.invitationId,
        adults: 2,
        stay: ["2026-10-02", "2026-10-04"],
      });
      const input = {
        ...f,
        actor: { kind: "guest" as const, partyId: f.partyId },
        expectedVisitId: null,
        expectedStay: null,
      };
      await expect(withdrawInvitation(db, input)).rejects.toThrow("changed");
      await expect(
        withdrawInvitation(db, {
          ...input,
          expectedVisitId: visit.visitId,
          expectedStay: ["2026-11-02", "2026-11-04"],
        }),
      ).rejects.toThrow("changed");
      const [row] =
        await db`select status from public.visits where id = ${visit.visitId}`;
      expect(row?.status).toBe("hold");
    } finally {
      await db`delete from public.homes where id = ${f.homeId}`;
    }
  });
});
