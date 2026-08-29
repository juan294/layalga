import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { NoopScheduler } from "@/agent/deps";
import { runAgentTask } from "@/agent/run-task";
import { ScriptedModel } from "@/agent/scripted-model";
import type { AgentTask } from "@/agent/task";
import { FakeClock } from "@/core/clock";

import {
  reconcileStaleRuns,
  runDueJobs,
  scheduleJobs,
  type AgentInvoker,
  type JobScheduler,
} from "./jobs";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false });
const homeId = "40000000-0000-4000-8000-000000000001";
const hostIds = [
  "40000000-0000-4000-8000-000000000201",
  "40000000-0000-4000-8000-000000000202",
] as const;
const partyId = "40000000-0000-4000-8000-000000000301";
const invitationId = "40000000-0000-4000-8000-000000000401";
const visitId = "40000000-0000-4000-8000-000000000501";
const chaseJobId = "40000000-0000-4000-8000-000000000601";

describe("reconfirmation jobs", () => {
  beforeEach(async () => {
    await sql`delete from public.homes where id = ${homeId}`;
    await sql`delete from public.agent_sessions where session_id like 'tick_40000000%'`;
    await sql`insert into public.homes (id, name, timezone) values (${homeId}, 'Jobs home', 'Europe/Madrid')`;
    await sql`insert into public.hosts (id, home_id, display_name, locale) values (${hostIds[0]}, ${homeId}, 'Nel', 'es'), (${hostIds[1]}, ${homeId}, 'Covadonga', 'en')`;
    await sql`insert into public.parties (id, home_id, family_name, locale, link_token) values (${partyId}, ${homeId}, 'Vega', 'es', 'jobs-vega')`;
    await sql`insert into public.invitations (id, home_id, host_id, party_id, raw_message) values (${invitationId}, ${homeId}, ${hostIds[0]}, ${partyId}, 'Vega')`;
    await sql`
      insert into public.visits (
        id, home_id, party_id, invitation_id, stay, adults, children, pets,
        status, confirmed_at
      ) values (
        ${visitId}, ${homeId}, ${partyId}, ${invitationId},
        daterange('2026-09-18', '2026-09-21', '[)'), 2, 2, 0,
        'confirmed', '2026-09-07T08:00:00Z'
      )
    `;
    await sql`
      insert into public.scheduled_jobs (id, home_id, visit_id, kind, due_at)
      values (${chaseJobId}, ${homeId}, ${visitId}, 'reconfirm_chase', '2026-09-15T07:00:00Z')
    `;
  });

  afterAll(() => sql.end());

  it("claims once, chases at T-3, and escalates to both hosts after 24 hours", async () => {
    const clock = new FakeClock(new Date("2026-09-15T09:00:00+02:00"));
    const invoker = scriptedInvoker(clock);

    const claims = await Promise.all([
      runDueJobs(sql, clock, invoker, homeId),
      runDueJobs(sql, clock, invoker, homeId),
    ]);
    expect(claims.flat()).toHaveLength(1);
    expect(await visitStatus()).toBe("reconfirm_pending");
    expect(await notificationCount("party")).toBe(1);

    const [escalation] = await sql<{ id: string; due_at: Date }[]>`
      select id, due_at from public.scheduled_jobs
      where visit_id = ${visitId} and kind = 'reconfirm_escalate'
    `;
    expect(escalation?.due_at.toISOString()).toBe("2026-09-16T07:00:00.000Z");

    clock.set(new Date("2026-09-16T09:05:00+02:00"));
    expect(await runDueJobs(sql, clock, invoker, homeId)).toHaveLength(1);
    expect(await visitStatus()).toBe("escalated");
    expect(await notificationCount("host")).toBe(2);
    expect(await runDueJobs(sql, clock, invoker, homeId)).toEqual([]);
    expect(await notificationCount()).toBe(3);
  });

  it("does not escalate after the guest reconfirms", async () => {
    const clock = new FakeClock(new Date("2026-09-15T09:00:00+02:00"));
    const invoker = scriptedInvoker(clock);
    await runDueJobs(sql, clock, invoker, homeId);

    clock.set(new Date("2026-09-15T18:00:00+02:00"));
    await runAgentTask(
      { task: "guest_reconfirm", homeId, visitId, answer: "yes" },
      agentDeps(clock, new ScriptedModel([])),
    );
    clock.set(new Date("2026-09-16T09:05:00+02:00"));

    expect(await runDueJobs(sql, clock, invoker, homeId)).toEqual([]);
    expect(await visitStatus()).toBe("reconfirmed");
    expect(await notificationCount("host")).toBe(0);
  });

  it("leaves demo jobs to the home-scoped demo clock runner", async () => {
    await sql`update public.homes set demo = true where id = ${homeId}`;
    const clock = new FakeClock(new Date("2026-09-15T09:00:00+02:00"));
    const invoker = scriptedInvoker(clock);

    const globalResults = await runDueJobs(sql, clock, invoker);
    expect(globalResults).not.toContainEqual(
      expect.objectContaining({ homeId }),
    );
    const [demoJob] = await sql<{ status: string }[]>`
      select status from public.scheduled_jobs where id = ${chaseJobId}
    `;
    expect(demoJob?.status).toBe("scheduled");
    expect(await runDueJobs(sql, clock, invoker, homeId)).toHaveLength(1);
  });

  it("recovers a partial escalation without duplicate notifications", async () => {
    const clock = new FakeClock(new Date("2026-09-15T09:00:00+02:00"));
    await runDueJobs(sql, clock, scriptedInvoker(clock), homeId);
    clock.set(new Date("2026-09-16T09:05:00+02:00"));

    let attempts = 0;
    const retryingInvoker: AgentInvoker = {
      async run(task) {
        attempts += 1;
        const recipients = attempts === 1 ? [hostIds[0]] : hostIds;
        const steps = recipients.flatMap((recipientId) => [
          {
            toolUse: {
              name: "notify",
              input: notificationInput(
                "host",
                recipientId,
                "reconfirm_escalation",
                task.jobId,
              ),
            },
          } as const,
        ]);
        await runAgentTask(
          task as AgentTask,
          agentDeps(
            clock,
            new ScriptedModel([...steps, { text: "Hosts notified." }]),
          ),
        );
        if (attempts === 1) throw new Error("simulated post-delivery failure");
      },
    };

    await expect(
      runDueJobs(sql, clock, retryingInvoker, homeId),
    ).rejects.toThrow("One or more reconfirmation jobs failed");
    expect(await notificationCount("host")).toBe(1);

    const [result] = await runDueJobs(sql, clock, retryingInvoker, homeId);
    expect(result?.action).toBe("escalate");
    expect(attempts).toBe(2);
    expect(await notificationCount("host")).toBe(2);
    expect(await runDueJobs(sql, clock, retryingInvoker, homeId)).toEqual([]);
  });

  it("delivers a new chase for a later reconfirmation cycle", async () => {
    const clock = new FakeClock(new Date("2026-09-15T09:00:00+02:00"));
    const invoker = scriptedInvoker(clock);
    await runDueJobs(sql, clock, invoker, homeId);
    expect(await notificationCount("party")).toBe(1);

    await sql`
      update public.scheduled_jobs
      set status = 'cancelled'
      where visit_id = ${visitId} and status in ('scheduled', 'running')
    `;
    await sql`
      update public.visits
      set status = 'confirmed', reconfirm_requested_at = null
      where id = ${visitId}
    `;
    await sql`
      insert into public.scheduled_jobs (
        home_id, visit_id, kind, due_at, status
      ) values (
        ${homeId}, ${visitId}, 'reconfirm_chase',
        ${clock.now().toISOString()}, 'scheduled'
      )
    `;

    await runDueJobs(sql, clock, invoker, homeId);
    expect(await notificationCount("party")).toBe(2);
  });

  it("reclaims only an expired job lease", async () => {
    const clock = new FakeClock(new Date("2026-09-15T09:00:00+02:00"));
    await sql`
      update public.scheduled_jobs
      set status = 'running', claimed_at = '2026-09-15T06:49:00Z',
        claim_token = ${crypto.randomUUID()}, attempt_count = 1
      where id = ${chaseJobId}
    `;

    expect(
      await runDueJobs(sql, clock, scriptedInvoker(clock), homeId),
    ).toHaveLength(1);
    const [job] = await sql<
      { status: string; attempt_count: number; claim_token: string | null }[]
    >`
      select status, attempt_count, claim_token
      from public.scheduled_jobs where id = ${chaseJobId}
    `;
    expect(job).toEqual({
      status: "done",
      attempt_count: 2,
      claim_token: null,
    });
  });

  it("does not steal a live job lease", async () => {
    const clock = new FakeClock(new Date("2026-09-15T09:00:00+02:00"));
    await sql`
      update public.scheduled_jobs
      set status = 'running', claimed_at = '2026-09-15T06:59:00Z',
        claim_token = ${crypto.randomUUID()}, attempt_count = 1
      where id = ${chaseJobId}
    `;
    expect(
      await runDueJobs(sql, clock, scriptedInvoker(clock), homeId),
    ).toEqual([]);
  });

  it("fails abandoned agent runs after their deadline", async () => {
    const [run] = await sql<{ id: string }[]>`
      insert into public.runs (
        home_id, session_id, task, deadline_at, heartbeat_at
      ) values (
        ${homeId}, 'stale-run', 'tick',
        '2026-09-15T06:59:00Z', '2026-09-15T06:50:00Z'
      ) returning id
    `;
    const clock = new FakeClock(new Date("2026-09-15T09:00:00+02:00"));
    expect(await reconcileStaleRuns(sql, clock.now(), homeId)).toBe(1);
    expect(await reconcileStaleRuns(sql, clock.now(), homeId)).toBe(0);
    const [stored] = await sql<{ status: string; result: { code: string } }[]>`
      select status, result from public.runs where id = ${run!.id}
    `;
    expect(stored).toMatchObject({
      status: "failed",
      result: { code: "run_deadline_exceeded" },
    });
  });

  it("expires stale temporary holds during the periodic runner", async () => {
    await sql`
      update public.visits
      set status = 'hold', hold_expires_at = '2026-09-14T07:00:00Z',
        confirmed_at = null
      where id = ${visitId}
    `;
    const clock = new FakeClock(new Date("2026-09-15T09:00:00+02:00"));
    expect(
      await runDueJobs(sql, clock, scriptedInvoker(clock), homeId),
    ).toEqual([]);
    const [visit] = await sql<{ status: string }[]>`
      select status from public.visits where id = ${visitId}
    `;
    expect(visit?.status).toBe("cancelled");
  });

  it("persists create and cancel operations idempotently", async () => {
    const scheduled: string[] = [];
    const cancelled: string[] = [];
    const scheduler: JobScheduler = {
      async schedule(job) {
        scheduled.push(job.id);
        return `external-${job.id}`;
      },
      async cancel(externalRef) {
        cancelled.push(externalRef);
      },
    };
    const create = {
      type: "create" as const,
      homeId,
      visitId,
      kind: "reconfirm_escalate" as const,
      dueAt: new Date("2026-09-16T09:00:00+02:00"),
    };

    const [[first], [second]] = await Promise.all([
      scheduleJobs(sql, scheduler, [create]),
      scheduleJobs(sql, scheduler, [create]),
    ]);
    expect(second?.id).toBe(first?.id);
    expect(scheduled).toEqual([first?.id]);

    await scheduleJobs(sql, scheduler, [
      { type: "cancel", visitId, kind: "reconfirm_escalate" },
    ]);
    expect(cancelled).toEqual([`external-${first?.id}`]);
    const [job] = await sql<{ status: string }[]>`
      select status from public.scheduled_jobs where id = ${first!.id}
    `;
    expect(job?.status).toBe("cancelled");
  });
});

function scriptedInvoker(clock: FakeClock): AgentInvoker {
  return {
    async run(task) {
      const [job] = await sql<{ kind: string }[]>`
        select kind from public.scheduled_jobs where id = ${task.jobId}
      `;
      const steps =
        job?.kind === "reconfirm_chase"
          ? [
              {
                toolUse: {
                  name: "notify",
                  input: notificationInput(
                    "party",
                    partyId,
                    "reconfirm_chase",
                    task.jobId,
                  ),
                },
              },
              { text: "Reconfirmation requested." },
            ]
          : [
              {
                toolUse: {
                  name: "notify",
                  input: notificationInput(
                    "host",
                    hostIds[0],
                    "reconfirm_escalation",
                    task.jobId,
                  ),
                },
              },
              {
                toolUse: {
                  name: "notify",
                  input: notificationInput(
                    "host",
                    hostIds[1],
                    "reconfirm_escalation",
                    task.jobId,
                  ),
                },
              },
              { text: "Hosts notified." },
            ];
      return runAgentTask(
        task as AgentTask,
        agentDeps(clock, new ScriptedModel(steps)),
      );
    },
  };
}

function notificationInput(
  recipientKind: "host" | "party",
  recipientId: string,
  kind: string,
  scheduledJobId: string,
) {
  return {
    homeId,
    recipientKind,
    recipientId,
    visitId,
    scheduledJobId,
    kind,
    bodyEn: "Please confirm your visit.",
    bodyEs: "Confirma tu visita, por favor.",
  };
}

function agentDeps(clock: FakeClock, model: ScriptedModel) {
  return {
    db: sql,
    clock,
    scheduler: new NoopScheduler(),
    appUrl: "http://localhost:3000",
    locale: "en" as const,
    model,
  };
}

async function visitStatus(): Promise<string | undefined> {
  const [visit] = await sql<{ status: string }[]>`
    select status from public.visits where id = ${visitId}
  `;
  return visit?.status;
}

async function notificationCount(
  recipientKind?: "host" | "party",
): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::integer as count from public.notifications
    where visit_id = ${visitId}
      and (${recipientKind ?? null}::text is null or recipient_kind = ${recipientKind ?? null})
  `;
  return row?.count ?? 0;
}
