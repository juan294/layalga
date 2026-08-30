import type { Clock } from "@/core/clock";
import { sqlClient, type DatabaseClient } from "@/core/db/client";
import type { ScheduledJobKind, ScheduledJobStatus } from "@/core/db/schema";

import {
  applyChase,
  applyEscalation,
  type JobOperation,
  type ReconfirmationTransition,
  type ReconfirmationVisit,
} from "./state-machine";

const CLAIM_LIMIT = 25;
const JOB_LEASE_MS = 10 * 60 * 1_000;
const MAX_JOB_ATTEMPTS = 3;
const JOB_RETRY_DELAYS_MS = [60_000, 5 * 60_000] as const;

export interface TickTask {
  task: "tick";
  homeId: string;
  jobId: string;
}

export interface AgentInvoker {
  run(task: TickTask): Promise<unknown>;
}

export interface AgentEnqueuer {
  enqueue(task: TickTask): Promise<{ runId: string; status: string }>;
}

export interface ScheduledJobRequest {
  id: string;
  homeId: string;
  kind: ScheduledJobKind;
  dueAt: Date;
}

export interface JobScheduler {
  schedule(job: ScheduledJobRequest): Promise<string | null>;
  cancel(externalRef: string): Promise<void>;
}

export interface ScheduledJobRecord extends ScheduledJobRequest {
  visitId: string;
  status: ScheduledJobStatus;
  externalRef: string | null;
}

export interface JobRunResult {
  jobId: string;
  homeId: string;
  visitId: string;
  kind: ScheduledJobKind;
  action: "chase" | "escalate" | "none";
  status: "done" | "skipped" | "queued";
  runId?: string;
}

interface JobRow {
  id: string;
  home_id: string;
  visit_id: string;
  kind: ScheduledJobKind;
  due_at: Date;
  status: ScheduledJobStatus;
  external_ref: string | null;
  claim_token: string | null;
  claimed_at: Date | null;
  attempt_count: number;
  available_at: Date;
  run_id: string | null;
}

interface VisitRow {
  id: string;
  home_id: string;
  stay_start: string;
  status: ReconfirmationVisit["status"];
  confirmed_at: Date | string | null;
  reconfirm_requested_at: Date | string | null;
  reconfirmed_at: Date | string | null;
  escalated_at: Date | string | null;
}

export const noopJobScheduler: JobScheduler = {
  async schedule() {
    return null;
  },
  async cancel() {},
};

export async function scheduleJobs(
  database: DatabaseClient,
  scheduler: JobScheduler,
  operations: readonly JobOperation[],
): Promise<ScheduledJobRecord[]> {
  const sql = sqlClient(database);
  const scheduled: ScheduledJobRecord[] = [];

  for (const operation of operations) {
    if (operation.type === "cancel") {
      const cancelled = await sql<{ external_ref: string | null }[]>`
        update public.scheduled_jobs
        set status = 'cancelled', claim_token = null, claimed_at = null
        where visit_id = ${operation.visitId}
          and kind = ${operation.kind}
          and status in ('scheduled', 'running')
        returning external_ref
      `;
      for (const { external_ref: externalRef } of cancelled) {
        if (externalRef) await scheduler.cancel(externalRef);
      }
      continue;
    }

    const [inserted] = await sql<JobRow[]>`
      insert into public.scheduled_jobs (home_id, visit_id, kind, due_at, status)
      values (
        ${operation.homeId}, ${operation.visitId}, ${operation.kind},
        ${operation.dueAt.toISOString()}, 'scheduled'
      )
      on conflict do nothing
      returning id, home_id, visit_id, kind, due_at, status, external_ref
    `;
    const row =
      inserted ??
      (
        await sql<JobRow[]>`
          select id, home_id, visit_id, kind, due_at, status, external_ref
          from public.scheduled_jobs
          where visit_id = ${operation.visitId}
            and kind = ${operation.kind}
            and status in ('scheduled', 'running')
          order by created_at, id
          limit 1
        `
      )[0];
    if (!row) throw new Error(`Failed to persist ${operation.kind} job`);

    const externalRef = await ensureExternalSchedule(database, scheduler, row);
    scheduled.push(toScheduledJob(row, externalRef));
  }

  return scheduled;
}

export async function runDueJobs(
  database: DatabaseClient,
  clock: Clock,
  agentInvoker: AgentInvoker,
  homeId?: string,
  scheduler: JobScheduler = noopJobScheduler,
): Promise<JobRunResult[]> {
  await reconcileStaleRuns(database, clock.now(), homeId);
  const { expireTemporaryHolds } = await import("@/core/booking/holds");
  await expireTemporaryHolds(database, clock, scheduler, homeId);
  const results: JobRunResult[] = [];
  const errors: unknown[] = [];
  const attemptedJobIds: string[] = [];

  for (let index = 0; index < CLAIM_LIMIT; index += 1) {
    const job = await claimDueJob(
      database,
      clock.now(),
      homeId,
      attemptedJobIds,
    );
    if (!job) break;
    attemptedJobIds.push(job.id);
    try {
      results.push(
        await executeClaimedJob(database, clock, agentInvoker, scheduler, job),
      );
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more reconfirmation jobs failed");
  }
  return results;
}

export async function dispatchDueJobs(
  database: DatabaseClient,
  clock: Clock,
  agentEnqueuer: AgentEnqueuer,
  homeId?: string,
  scheduler: JobScheduler = noopJobScheduler,
): Promise<JobRunResult[]> {
  await reconcileStaleRuns(database, clock.now(), homeId);
  const { expireTemporaryHolds } = await import("@/core/booking/holds");
  await expireTemporaryHolds(database, clock, scheduler, homeId);
  const results: JobRunResult[] = [];
  const attemptedJobIds: string[] = [];

  for (let index = 0; index < CLAIM_LIMIT; index += 1) {
    const job = await claimDueJob(
      database,
      clock.now(),
      homeId,
      attemptedJobIds,
    );
    if (!job) break;
    attemptedJobIds.push(job.id);
    try {
      const action = await prepareClaimedJob(database, clock, scheduler, job);
      if (action === "none") {
        await completeClaimedJob(database, job);
        results.push(result(job, action, "done"));
        continue;
      }
      const queued = await agentEnqueuer.enqueue({
        task: "tick",
        homeId: job.home_id,
        jobId: job.id,
      });
      if (queued.status === "completed") {
        if (!(await deliveryIsComplete(database, job))) {
          throw new Error(
            `Completed run did not deliver the ${job.kind} notification`,
          );
        }
        await completeClaimedJob(database, job);
        results.push(result(job, action, "done"));
        continue;
      }
      if (queued.status !== "queued") {
        throw new Error(`Scheduled agent run was not queued: ${queued.runId}`);
      }
      const sql = sqlClient(database);
      const [linked] = await sql<{ id: string }[]>`
        update public.scheduled_jobs
        set run_id = ${queued.runId}
        where id = ${job.id} and status = 'running'
          and claim_token = ${job.claim_token}
        returning id
      `;
      if (!linked) throw new Error(`Lost scheduled job lease: ${job.id}`);
      results.push({
        ...result(job, action, "queued"),
        runId: queued.runId,
      });
    } catch (error) {
      await recordJobFailure(database, clock.now(), job);
      console.error("[SCHEDULED_JOB_DISPATCH_FAILED]", {
        jobId: job.id,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  return results;
}

export async function runJob(
  database: DatabaseClient,
  clock: Clock,
  agentInvoker: AgentInvoker,
  jobId: string,
  scheduler: JobScheduler = noopJobScheduler,
): Promise<JobRunResult> {
  await reconcileStaleRuns(database, clock.now());
  const job = await claimJob(database, jobId, clock.now());
  if (!job) {
    const existing = await loadJob(database, jobId);
    if (!existing) throw new Error(`Scheduled job not found: ${jobId}`);
    return result(existing, "none", "skipped");
  }
  return executeClaimedJob(database, clock, agentInvoker, scheduler, job);
}

export async function completeDispatchedJob(
  database: DatabaseClient,
  jobId: string,
  runId: string,
): Promise<void> {
  const job = await loadDispatchedJob(database, jobId, runId);
  if (!job) return;
  if (!(await deliveryIsComplete(database, job))) {
    throw new Error(
      `The ${job.kind} job did not reach every required recipient`,
    );
  }
  await completeClaimedJob(database, job);
}

export async function failDispatchedJob(
  database: DatabaseClient,
  now: Date,
  jobId: string,
  runId: string,
): Promise<void> {
  const job = await loadDispatchedJob(database, jobId, runId);
  if (job) await recordJobFailure(database, now, job);
}

async function loadDispatchedJob(
  database: DatabaseClient,
  jobId: string,
  runId: string,
): Promise<JobRow | undefined> {
  const sql = sqlClient(database);
  const [job] = await sql<JobRow[]>`
    select id, home_id, visit_id, kind, due_at, status, external_ref,
      claim_token, claimed_at, attempt_count, available_at, run_id
    from public.scheduled_jobs
    where id = ${jobId} and run_id = ${runId} and status = 'running'
  `;
  return job;
}

export async function replayQuarantinedJob(
  database: DatabaseClient,
  jobId: string,
  now: Date,
): Promise<void> {
  const sql = sqlClient(database);
  const [replayed] = await sql<{ id: string }[]>`
    update public.scheduled_jobs
    set status = 'scheduled', attempt_count = 0,
      available_at = ${now.toISOString()}, quarantined_at = null,
      claim_token = null, claimed_at = null, run_id = null,
      last_error = null
    where id = ${jobId} and status = 'quarantined'
    returning id
  `;
  if (!replayed) throw new Error(`Quarantined job not found: ${jobId}`);
}

async function executeClaimedJob(
  database: DatabaseClient,
  clock: Clock,
  agentInvoker: AgentInvoker,
  scheduler: JobScheduler,
  job: JobRow,
): Promise<JobRunResult> {
  try {
    const action = await prepareClaimedJob(database, clock, scheduler, job);
    if (action !== "none") {
      await agentInvoker.run({
        task: "tick",
        homeId: job.home_id,
        jobId: job.id,
      });
      if (!(await deliveryIsComplete(database, job))) {
        throw new Error(
          `The ${job.kind} job did not reach every required recipient`,
        );
      }
    }

    await completeClaimedJob(database, job);
    return result(job, action, "done");
  } catch (error) {
    await recordJobFailure(database, clock.now(), job);
    throw error;
  }
}

async function prepareClaimedJob(
  database: DatabaseClient,
  clock: Clock,
  scheduler: JobScheduler,
  job: JobRow,
): Promise<JobRunResult["action"]> {
  const sql = sqlClient(database);
  const { transition, changed } = await sql.begin(async (transaction) => {
    const [visitRow] = await transaction<VisitRow[]>`
        select id, home_id, lower(stay)::text as stay_start, status,
          confirmed_at, reconfirm_requested_at, reconfirmed_at, escalated_at
        from public.visits
        where id = ${job.visit_id}
        for update
      `;
    if (!visitRow) throw new Error(`Visit not found: ${job.visit_id}`);

    const visit = toVisit(visitRow);
    const next = transitionFor(job.kind, visit, clock.now());
    if (next.visit !== visit) {
      await transaction`
          update public.visits
          set status = ${next.visit.status},
            reconfirm_requested_at = ${timestamp(next.visit.reconfirmRequestedAt)},
            reconfirmed_at = ${timestamp(next.visit.reconfirmedAt)},
            escalated_at = ${timestamp(next.visit.escalatedAt)}
          where id = ${visit.id}
        `;
    }
    return { transition: next, changed: next.visit !== visit };
  });

  await scheduleJobs(database, scheduler, transition.jobs);
  const candidateAction = actionFor(job.kind, transition);
  return candidateAction !== "none" &&
    !changed &&
    (await deliveryIsComplete(database, job))
    ? "none"
    : candidateAction;
}

async function completeClaimedJob(
  database: DatabaseClient,
  job: JobRow,
): Promise<void> {
  const sql = sqlClient(database);
  const [completed] = await sql<{ id: string }[]>`
      update public.scheduled_jobs
      set status = 'done', claim_token = null, claimed_at = null,
        last_error = null, run_id = null
      where id = ${job.id} and status = 'running'
        and claim_token = ${job.claim_token}
      returning id
    `;
  if (!completed) throw new Error(`Lost scheduled job lease: ${job.id}`);
}

async function recordJobFailure(
  database: DatabaseClient,
  now: Date,
  job: JobRow,
): Promise<void> {
  const sql = sqlClient(database);
  const quarantined = job.attempt_count >= MAX_JOB_ATTEMPTS;
  const delay = JOB_RETRY_DELAYS_MS[job.attempt_count - 1] ?? 0;
  const failed = await sql<{ id: string }[]>`
    update public.scheduled_jobs
    set status = ${quarantined ? "quarantined" : "scheduled"},
      claim_token = null, claimed_at = null, run_id = null,
      available_at = ${new Date(now.getTime() + delay).toISOString()},
      quarantined_at = ${quarantined ? now.toISOString() : null},
      last_error = 'Scheduled job execution failed'
    where id = ${job.id} and status = 'running'
      and claim_token = ${job.claim_token}
    returning id
  `;
  if (quarantined && failed.length > 0) {
    await sql`
      insert into public.audit_events (home_id, actor, kind, payload)
      values (
        ${job.home_id}, 'system', 'scheduled_job_quarantined',
        ${JSON.stringify({ jobId: job.id, kind: job.kind })}::text::jsonb
      )
    `;
    console.error("[SCHEDULED_JOB_QUARANTINED]", { jobId: job.id });
  }
}

async function claimDueJob(
  database: DatabaseClient,
  now: Date,
  homeId?: string,
  excludedJobIds: readonly string[] = [],
): Promise<JobRow | undefined> {
  const sql = sqlClient(database);
  const token = randomUUID();
  const staleBefore = new Date(now.getTime() - JOB_LEASE_MS);
  const rows = await sql.begin(
    (transaction) => transaction<JobRow[]>`
    with due as (
      select id
      from public.scheduled_jobs
      where (
          status = 'scheduled'
          or (
            status = 'running'
            and claimed_at <= ${staleBefore.toISOString()}
            and not exists (
              select 1 from public.runs
              where runs.id = scheduled_jobs.run_id
                and runs.status in ('queued', 'running')
            )
          )
        )
        and due_at <= ${now.toISOString()}
        and available_at <= ${now.toISOString()}
        and id <> all(${transaction.array([...excludedJobIds])}::uuid[])
        and (${homeId ?? null}::uuid is null or home_id = ${homeId ?? null})
        and (
          ${homeId ?? null}::uuid is not null
          or exists (
            select 1 from public.homes
            where homes.id = scheduled_jobs.home_id and homes.demo = false
          )
        )
      order by due_at, id
      limit 1
      for update skip locked
    )
    update public.scheduled_jobs as job
    set status = 'running', claimed_at = ${now.toISOString()},
      claim_token = ${token}, attempt_count = job.attempt_count + 1,
      last_error = null
    from due
    where job.id = due.id
    returning job.id, job.home_id, job.visit_id, job.kind, job.due_at,
      job.status, job.external_ref, job.claim_token, job.claimed_at,
      job.attempt_count, job.available_at, job.run_id
  `,
  );
  return rows[0];
}

async function claimJob(
  database: DatabaseClient,
  jobId: string,
  now: Date,
): Promise<JobRow | undefined> {
  const sql = sqlClient(database);
  const token = randomUUID();
  const staleBefore = new Date(now.getTime() - JOB_LEASE_MS);
  const rows = await sql.begin(
    (transaction) => transaction<JobRow[]>`
    with due as (
      select id from public.scheduled_jobs
      where id = ${jobId}
        and (status = 'scheduled'
          or (
            status = 'running'
            and claimed_at <= ${staleBefore.toISOString()}
            and not exists (
              select 1 from public.runs
              where runs.id = scheduled_jobs.run_id
                and runs.status in ('queued', 'running')
            )
          ))
        and due_at <= ${now.toISOString()}
        and available_at <= ${now.toISOString()}
      for update skip locked
    )
    update public.scheduled_jobs as job
    set status = 'running', claimed_at = ${now.toISOString()},
      claim_token = ${token}, attempt_count = job.attempt_count + 1,
      last_error = null
    from due
    where job.id = due.id
    returning job.id, job.home_id, job.visit_id, job.kind, job.due_at,
      job.status, job.external_ref, job.claim_token, job.claimed_at,
      job.attempt_count, job.available_at, job.run_id
  `,
  );
  return rows[0];
}

async function loadJob(
  database: DatabaseClient,
  jobId: string,
): Promise<JobRow | undefined> {
  const sql = sqlClient(database);
  const rows = await sql<JobRow[]>`
    select id, home_id, visit_id, kind, due_at, status, external_ref,
      claim_token, claimed_at, attempt_count
      , available_at, run_id
    from public.scheduled_jobs where id = ${jobId}
  `;
  return rows[0];
}

export async function reconcileStaleRuns(
  database: DatabaseClient,
  now: Date,
  homeId?: string,
): Promise<number> {
  const sql = sqlClient(database);
  return sql.begin(async (transaction) => {
    const recovered = await transaction<{ id: string }[]>`
      update public.runs
      set status = 'queued', queue_available_at = ${now.toISOString()},
        queue_claimed_at = null, queue_claim_token = null,
        heartbeat_at = null, deadline_at = null,
        result = ${JSON.stringify({
          code: "run_lease_recovered",
          summary:
            "The agent run was recovered after its worker lease expired.",
        })}::text::jsonb,
        last_error = 'Agent worker lease expired'
      where status = 'running'
        and queue_claim_token is not null
        and execution_attempt_count < 3
        and deadline_at is not null
        and deadline_at <= ${now.toISOString()}
        and (${homeId ?? null}::uuid is null or home_id = ${homeId ?? null})
      returning id
    `;
    const rows = await transaction<{ id: string }[]>`
      update public.runs
      set status = 'failed', finished_at = ${now.toISOString()},
        result = ${JSON.stringify({
          code: "run_deadline_exceeded",
          summary: "The agent run exceeded its execution deadline.",
        })}::text::jsonb,
        queue_claimed_at = null, queue_claim_token = null,
        last_error = 'Agent execution deadline exceeded'
      where status = 'running'
        and deadline_at is not null
        and deadline_at <= ${now.toISOString()}
        and (${homeId ?? null}::uuid is null or home_id = ${homeId ?? null})
      returning id
    `;
    if (rows.length > 0) {
      await transaction`
        update public.pending_decisions
        set applied_run_id = null,
          application_error = 'The prior resume attempt exceeded its execution deadline.'
        where applied_run_id = any(${transaction.array(rows.map(({ id }) => id))}::uuid[])
          and not exists (
            select 1 from public.audit_events
            where kind = 'decision_applied'
              and payload->>'pendingDecisionId' = public.pending_decisions.id::text
          )
      `;
    }
    return recovered.length + rows.length;
  });
}

function transitionFor(
  kind: ScheduledJobKind,
  visit: ReconfirmationVisit,
  now: Date,
): ReconfirmationTransition {
  if (kind === "reconfirm_chase") {
    const transition = applyChase(visit, now);
    if (
      transition.visit === visit &&
      visit.status === "reconfirm_pending" &&
      visit.reconfirmRequestedAt
    ) {
      return {
        visit,
        jobs: [
          {
            type: "create",
            homeId: visit.homeId,
            visitId: visit.id,
            kind: "reconfirm_escalate",
            dueAt: new Date(
              visit.reconfirmRequestedAt.getTime() + 24 * 60 * 60 * 1_000,
            ),
          },
        ],
      };
    }
    return transition;
  }
  return applyEscalation(visit, now);
}

function actionFor(
  kind: ScheduledJobKind,
  transition: ReconfirmationTransition,
): JobRunResult["action"] {
  if (kind === "reconfirm_chase") {
    return transition.visit.status === "reconfirm_pending" ? "chase" : "none";
  }
  return transition.visit.status === "escalated" ? "escalate" : "none";
}

async function deliveryIsComplete(
  database: DatabaseClient,
  job: JobRow,
): Promise<boolean> {
  const sql = sqlClient(database);
  if (job.kind === "reconfirm_chase") {
    const [row] = await sql<{ complete: boolean }[]>`
      select exists (
        select 1
        from public.visits visit
        join public.notifications notification
          on notification.scheduled_job_id = ${job.id}
         and notification.recipient_kind = 'party'
         and notification.recipient_id = visit.party_id
         and notification.kind = 'reconfirm_chase'
        where visit.id = ${job.visit_id}
      ) as complete
    `;
    return row?.complete ?? false;
  }

  const [row] = await sql<{ complete: boolean }[]>`
    select not exists (
      select 1
      from public.hosts host
      where host.home_id = ${job.home_id}
        and not exists (
          select 1
          from public.notifications notification
          where notification.scheduled_job_id = ${job.id}
            and notification.recipient_kind = 'host'
            and notification.recipient_id = host.id
            and notification.kind = 'reconfirm_escalation'
        )
    ) as complete
  `;
  return row?.complete ?? false;
}

async function ensureExternalSchedule(
  database: DatabaseClient,
  scheduler: JobScheduler,
  row: JobRow,
): Promise<string | null> {
  if (row.external_ref) return row.external_ref;
  const sql = sqlClient(database);
  const claimToken = randomUUID();
  const [claimed] = await sql<{ id: string }[]>`
    update public.scheduled_jobs
    set schedule_claim_token = ${claimToken}, schedule_claimed_at = now()
    where id = ${row.id}
      and external_ref is null
      and status in ('scheduled', 'running')
      and (
        schedule_claim_token is null
        or schedule_claimed_at <= now() - interval '10 minutes'
      )
    returning id
  `;

  if (!claimed) {
    const [current] = await sql<{ id: string; external_ref: string | null }[]>`
      select id, external_ref from public.scheduled_jobs where id = ${row.id}
    `;
    if (!current) throw new Error(`Scheduled job not found: ${row.id}`);
    return current.external_ref;
  }

  try {
    const externalRef = await scheduler.schedule(toScheduleRequest(row));
    if (!externalRef) {
      await releaseScheduleClaim(sql, row.id, claimToken);
      return null;
    }

    const [stored] = await sql<{ external_ref: string }[]>`
      update public.scheduled_jobs
      set external_ref = ${externalRef}, schedule_claim_token = null,
        schedule_claimed_at = null
      where id = ${row.id}
        and schedule_claim_token = ${claimToken}
        and status in ('scheduled', 'running')
      returning external_ref
    `;
    if (stored) return stored.external_ref;

    await scheduler.cancel(externalRef);
    const [current] = await sql<{ external_ref: string | null }[]>`
      select external_ref from public.scheduled_jobs where id = ${row.id}
    `;
    return current?.external_ref ?? null;
  } catch (error) {
    await releaseScheduleClaim(sql, row.id, claimToken);
    throw error;
  }
}

async function releaseScheduleClaim(
  sql: ReturnType<typeof sqlClient>,
  jobId: string,
  claimToken: string,
): Promise<void> {
  await sql`
    update public.scheduled_jobs
    set schedule_claim_token = null, schedule_claimed_at = null
    where id = ${jobId} and schedule_claim_token = ${claimToken}
  `;
}

function toVisit(row: VisitRow): ReconfirmationVisit {
  return {
    id: row.id,
    homeId: row.home_id,
    stayStart: row.stay_start,
    status: row.status,
    confirmedAt: dateOrNull(row.confirmed_at),
    reconfirmRequestedAt: dateOrNull(row.reconfirm_requested_at),
    reconfirmedAt: dateOrNull(row.reconfirmed_at),
    escalatedAt: dateOrNull(row.escalated_at),
  };
}

function toScheduleRequest(row: JobRow): ScheduledJobRequest {
  return {
    id: row.id,
    homeId: row.home_id,
    kind: row.kind,
    dueAt: row.due_at,
  };
}

function toScheduledJob(
  row: JobRow,
  externalRef: string | null,
): ScheduledJobRecord {
  return {
    ...toScheduleRequest(row),
    visitId: row.visit_id,
    status: row.status,
    externalRef,
  };
}

function result(
  job: JobRow,
  action: JobRunResult["action"],
  status: JobRunResult["status"],
): JobRunResult {
  return {
    jobId: job.id,
    homeId: job.home_id,
    visitId: job.visit_id,
    kind: job.kind,
    action,
    status,
  };
}

function timestamp(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function dateOrNull(value: Date | string | null): Date | null {
  return value === null ? null : new Date(value);
}
import { randomUUID } from "node:crypto";
