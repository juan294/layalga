import { createHash, randomUUID } from "node:crypto";

import {
  InterruptResponseContent,
  type BaseModelConfig,
  type Model,
} from "@strands-agents/sdk";
import type { TransactionSql } from "postgres";

import { sqlClient } from "@/core/db/client";
import { applyGuestReconfirmation } from "@/core/reconfirmation/apply-guest-answer";
import {
  completeDispatchedJob,
  failDispatchedJob,
  reconcileStaleRuns,
} from "@/core/reconfirmation/jobs";

import { buildAgent } from "./agent";
import type { AgentAuthority, AgentDeps } from "./deps";
import { agentTaskSchema, type AgentTask, type RunResult } from "./task";

export interface RunAgentDeps extends AgentDeps {
  model?: Model<BaseModelConfig>;
}

const AGENT_EXECUTION_FAILURE = {
  code: "agent_execution_failed",
  summary: "The agent could not complete this request.",
} as const;

export async function runAgentTask(
  payload: AgentTask,
  deps: RunAgentDeps,
): Promise<RunResult> {
  const queued = await enqueueAgentTask(payload, deps);
  return queued.status === "queued"
    ? executeQueuedAgentRun(queued.runId, deps)
    : queued;
}

export async function enqueueAgentTask(
  payload: AgentTask,
  deps: RunAgentDeps,
): Promise<RunResult> {
  const task = agentTaskSchema.parse(payload);
  const sql = sqlClient(deps.db);
  const authority = await authorityForTask(task, deps);
  const sessionId = await resolveSessionId(task, { ...deps, authority });
  await reconcileStaleRuns(deps.db, deps.clock.now(), task.homeId);
  const queuedAt = deps.clock.now();
  const runPayload =
    task.task === "guest_submit"
      ? {
          ...task,
          trustedSpecialRequests: authority.guestSubmission!.specialRequests,
        }
      : task;
  const runStart = await startRun({
    sql,
    task,
    sessionId,
    runPayload,
    startedAt: queuedAt,
    actorKey: actorKeyForTask(task),
    intentKey: await intentKeyForTask(task, sql, queuedAt),
  });
  if (runStart.replay) return runStart.result;
  return queuedRunResult(runStart.runId, sessionId);
}

export async function executeQueuedAgentRun(
  runId: string,
  deps: RunAgentDeps,
): Promise<RunResult> {
  const sql = sqlClient(deps.db);
  const claimed = await claimQueuedRun(sql, runId, deps.clock.now());
  if (!claimed) {
    const [existing] = await sql<
      {
        status: "queued" | "running" | "completed" | "interrupted" | "failed";
        session_id: string;
        result: unknown;
      }[]
    >`
      select status, session_id, result from public.runs where id = ${runId}
    `;
    if (!existing) throw new Error(`Agent run not found: ${runId}`);
    if (existing.status === "completed" || existing.status === "interrupted") {
      return storedRunResult(
        sql as unknown as TransactionSql,
        runId,
        existing.session_id,
        existing.status,
        existing.result,
      );
    }
    if (existing.status === "failed") {
      throw new Error("Agent run is in a terminal failed state");
    }
    throw new Error("Agent run is already being executed");
  }

  const parsed = agentTaskSchema.safeParse(claimed.payload);
  if (!parsed.success) {
    await failClaimedRun(sql, runId, claimed.queue_claim_token);
    throw new Error("Persisted agent task is invalid");
  }
  const task = parsed.data;
  if (task.homeId !== claimed.home_id) {
    await failClaimedRun(sql, runId, claimed.queue_claim_token);
    throw new Error("Persisted agent task is outside its run home");
  }

  try {
    const authority = await authorityForTask(task, deps);
    return await executeClaimedAgentTask(
      task,
      { ...deps, authority },
      { id: runId, claimToken: claimed.queue_claim_token },
      claimed.session_id,
    );
  } catch (error) {
    await failClaimedRun(sql, runId, claimed.queue_claim_token);
    throw error;
  }
}

async function executeClaimedAgentTask(
  task: AgentTask,
  deps: RunAgentDeps,
  run: { id: string; claimToken: string },
  sessionId: string,
): Promise<RunResult> {
  const sql = sqlClient(deps.db);

  try {
    if (task.task === "guest_reconfirm" && task.answer === "yes") {
      await applyGuestReconfirmation(
        deps.db,
        deps.clock,
        deps.scheduler,
        task.homeId,
        task.visitId,
        "yes",
      );
      return await finish(
        sql,
        run.id,
        sessionId,
        "Reconfirmed",
        deps.clock.now(),
        run.claimToken,
      );
    }

    const resumeDecisions: { id: string; interruptId: string }[] = [];
    if (task.task === "resume") {
      for (const { interruptId, response } of task.responses) {
        const [decision] = await sql<
          {
            id: string;
            status: "pending" | "approved" | "declined";
            decided_by_host_id: string | null;
            note: string | null;
          }[]
        >`
          select id, status, decided_by_host_id, note
          from public.pending_decisions
          where agent_session_id = ${sessionId} and interrupt_id = ${interruptId}
        `;
        if (!decision)
          throw new Error(`Pending decision not found: ${interruptId}`);
        const expectedStatus = response.approved ? "approved" : "declined";
        if (
          decision.status !== expectedStatus ||
          decision.decided_by_host_id !== response.hostId ||
          decision.note !== (response.note ?? null)
        ) {
          throw new Error(
            `Pending decision has not been recorded by this host: ${interruptId}`,
          );
        }
        resumeDecisions.push({ id: decision.id, interruptId });
      }
      for (const decision of resumeDecisions) {
        const [claimed] = await sql<{ id: string }[]>`
          update public.pending_decisions
          set applied_run_id = ${run.id}, application_error = null
          where id = ${decision.id} and home_id = ${task.homeId}
            and (applied_run_id is null or applied_run_id = ${run.id})
          returning id
        `;
        if (!claimed) {
          throw new Error(
            `Pending decision is already being applied: ${decision.interruptId}`,
          );
        }
      }
    }

    const agent = buildAgent({
      sessionId,
      deps,
      task: task.task,
      model: deps.model,
    });
    const invokeArgs =
      task.task === "resume"
        ? task.responses.map(
            ({ interruptId, response }) =>
              new InterruptResponseContent({ interruptId, response }),
          )
        : await buildPrompt(task, deps);
    await sql`
      update public.runs set heartbeat_at = ${deps.clock.now().toISOString()}
      where id = ${run.id} and status = 'running'
    `;
    const result = await agent.invoke(invokeArgs, {
      invocationState: { runId: run.id },
      cancelSignal: AbortSignal.timeout(240_000),
    });
    if (result.stopReason === "cancelled") {
      throw new Error("Agent execution budget exceeded");
    }

    if (result.stopReason === "interrupt") {
      const ids: string[] = [];
      for (const interrupt of result.interrupts ?? []) {
        const [decision] = await sql<{ id: string }[]>`
          insert into public.pending_decisions (
            home_id, run_id, agent_session_id, interrupt_id, interrupt_name, reason
          ) values (
            ${task.homeId}, ${run.id}, ${sessionId}, ${interrupt.id},
            ${interrupt.name}, ${JSON.stringify(interrupt.reason ?? null)}::text::jsonb
          )
          on conflict (agent_session_id, interrupt_id) do update
          set reason = excluded.reason
          returning id
        `;
        if (decision) ids.push(decision.id);
      }
      await sql`
        update public.runs set status = 'interrupted', result = ${JSON.stringify(
          {
            summary: result.toString(),
          },
        )}::text::jsonb, finished_at = ${deps.clock.now().toISOString()},
          queue_claim_token = null, queue_claimed_at = null, last_error = null
        where id = ${run.id} and status = 'running'
          and queue_claim_token = ${run.claimToken}
      `;
      return {
        runId: run.id,
        status: "interrupted",
        sessionId,
        pendingDecisionIds: ids,
        summary: result.toString(),
      };
    }

    if (task.task === "resume") {
      for (const decision of resumeDecisions) {
        await sql.begin(async (transaction) => {
          const [applied] = await transaction<{ id: string }[]>`
            update public.pending_decisions
            set applied_run_id = ${run.id}, application_error = null
            where id = ${decision.id}
              and home_id = ${task.homeId}
              and applied_run_id = ${run.id}
            returning id
          `;
          if (!applied) return;
          await transaction`
            insert into public.audit_events (home_id, run_id, actor, kind, payload)
            select ${task.homeId}, ${run.id}, 'agent', 'decision_applied',
              ${JSON.stringify({
                pendingDecisionId: decision.id,
                runId: run.id,
                interruptId: decision.interruptId,
              })}::text::jsonb
            where not exists (
              select 1 from public.audit_events
              where kind = 'decision_applied'
                and payload->>'pendingDecisionId' = ${decision.id}
            )
          `;
        });
      }
    }
    if (task.task === "tick") {
      await completeDispatchedJob(deps.db, task.jobId, run.id);
    }
    return await finish(
      sql,
      run.id,
      sessionId,
      result.toString(),
      deps.clock.now(),
      run.claimToken,
    );
  } catch (error) {
    const summary = error instanceof Error ? error.message : String(error);
    await sql`
      update public.runs set status = 'failed', result = ${JSON.stringify(
        AGENT_EXECUTION_FAILURE,
      )}::text::jsonb,
        finished_at = ${deps.clock.now().toISOString()},
        queue_claim_token = null, queue_claimed_at = null,
        last_error = 'Agent execution failed'
        where id = ${run.id} and status = 'running'
          and queue_claim_token = ${run.claimToken}
    `;
    if (task.task === "resume") {
      await sql`
        update public.pending_decisions
        set application_error = ${summary},
          applied_run_id = case
            when applied_run_id = ${run.id}
              and not exists (
                select 1 from public.audit_events
                where kind = 'decision_applied'
                  and payload->>'pendingDecisionId' = public.pending_decisions.id::text
              ) then null
            else applied_run_id
          end
        where agent_session_id = ${sessionId}
          and interrupt_id in ${sql(task.responses.map(({ interruptId }) => interruptId))}
          and status in ('approved', 'declined')
          and (applied_run_id is null or applied_run_id = ${run.id})
      `;
    }
    if (task.task === "tick") {
      await failDispatchedJob(deps.db, deps.clock.now(), task.jobId, run.id);
    }
    throw error;
  }
}

interface StartRunInput {
  sql: ReturnType<typeof sqlClient>;
  task: AgentTask;
  sessionId: string;
  runPayload: AgentTask | (AgentTask & { trustedSpecialRequests: string[] });
  startedAt: Date;
  actorKey: string;
  intentKey: string;
}

type StartRunResult =
  { replay: false; runId: string } | { replay: true; result: RunResult };

interface ClaimedRunRow {
  id: string;
  home_id: string;
  session_id: string;
  payload: unknown;
  queue_claim_token: string;
}

async function claimQueuedRun(
  sql: ReturnType<typeof sqlClient>,
  runId: string,
  now: Date,
): Promise<ClaimedRunRow | undefined> {
  const claimToken = randomUUID();
  const staleBefore = new Date(now.getTime() - 6 * 60 * 1_000);
  const deadlineAt = new Date(now.getTime() + 4 * 60 * 1_000);
  const rows = await sql.begin(
    (transaction) => transaction<ClaimedRunRow[]>`
      with claimable as (
        select id from public.runs
        where id = ${runId}
          and execution_attempt_count < 3
          and (
            (status = 'queued' and queue_available_at <= ${now.toISOString()})
            or (
              status = 'running'
              and queue_claimed_at <= ${staleBefore.toISOString()}
            )
          )
        for update skip locked
      )
      update public.runs as run
      set status = 'running', queue_claimed_at = ${now.toISOString()},
        queue_claim_token = ${claimToken},
        execution_attempt_count = run.execution_attempt_count + 1,
        heartbeat_at = ${now.toISOString()},
        deadline_at = ${deadlineAt.toISOString()}, last_error = null
      from claimable
      where run.id = claimable.id
      returning run.id, run.home_id, run.session_id, run.payload,
        run.queue_claim_token
    `,
  );
  return rows[0];
}

async function failClaimedRun(
  sql: ReturnType<typeof sqlClient>,
  runId: string,
  claimToken: string,
): Promise<void> {
  await sql`
    update public.runs
    set status = 'failed', finished_at = now(),
      result = ${JSON.stringify(AGENT_EXECUTION_FAILURE)}::text::jsonb,
      queue_claimed_at = null, queue_claim_token = null,
      last_error = 'Agent execution failed'
    where id = ${runId} and status = 'running'
      and queue_claim_token = ${claimToken}
  `;
}

function queuedRunResult(runId: string, sessionId: string): RunResult {
  return {
    runId,
    status: "queued",
    sessionId,
    pendingDecisionIds: [],
    summary: "Your request is queued.",
  };
}

async function startRun(input: StartRunInput): Promise<StartRunResult> {
  const { sql, task, sessionId, runPayload, startedAt, actorKey, intentKey } =
    input;
  return sql.begin(async (transaction) => {
    await transaction`
      select pg_advisory_xact_lock(hashtextextended(${task.homeId}::text, 0))
    `;
    const [existing] = await transaction<
      {
        id: string;
        status: "queued" | "running" | "completed" | "interrupted" | "failed";
        result: unknown;
        request_attempt_count: number;
      }[]
    >`
      select id, status, result, request_attempt_count
      from public.runs
      where home_id = ${task.homeId} and intent_key = ${intentKey}
    `;
    if (existing) {
      if (existing.status === "queued" || existing.status === "running") {
        return {
          replay: true,
          result: queuedRunResult(existing.id, sessionId),
        };
      }
      if (task.task === "tick" || existing.status === "failed") {
        const interactiveRetry = task.task !== "tick";
        if (interactiveRetry) {
          if (existing.request_attempt_count >= 3) {
            throw new Error("Agent request retry limit reached");
          }
          assertRequestLimit(
            task,
            await loadRequestUsage(transaction, task, actorKey, startedAt),
          );
        }
        const [restarted] = await transaction<{ id: string }[]>`
          update public.runs
          set status = 'queued', result = null,
            started_at = ${startedAt.toISOString()}, finished_at = null,
            heartbeat_at = null, deadline_at = null,
            queue_available_at = ${startedAt.toISOString()},
            queue_claimed_at = null, queue_claim_token = null,
            execution_attempt_count = 0,
            last_error = null,
            payload = ${JSON.stringify(runPayload)}::text::jsonb,
            request_attempt_count = request_attempt_count + ${interactiveRetry ? 1 : 0}
          where id = ${existing.id} and status = ${existing.status}
          returning id
        `;
        if (!restarted) throw new Error("Failed to retry the agent request");
        return { replay: false, runId: restarted.id };
      }
      return {
        replay: true,
        result: await storedRunResult(
          transaction,
          existing.id,
          sessionId,
          existing.status,
          existing.result,
        ),
      };
    }

    assertRequestLimit(
      task,
      await loadRequestUsage(transaction, task, actorKey, startedAt),
    );

    const [created] = await transaction<{ id: string }[]>`
      insert into public.runs (
        home_id, session_id, task, status, payload, queue_available_at,
        actor_key, intent_key, started_at
      ) values (
        ${task.homeId}, ${sessionId}, ${task.task}, 'queued',
        ${JSON.stringify(runPayload)}::text::jsonb, ${startedAt.toISOString()},
        ${actorKey}, ${intentKey},
        ${startedAt.toISOString()}
      )
      returning id
    `;
    if (!created) throw new Error("Failed to start agent run");
    return { replay: false, runId: created.id };
  });
}

interface RequestUsage {
  actor_requests: number;
  actor_active: number;
  home_requests: number;
  home_active: number;
}

async function loadRequestUsage(
  transaction: TransactionSql,
  task: AgentTask,
  actorKey: string,
  startedAt: Date,
): Promise<RequestUsage> {
  const windowStart = new Date(startedAt.getTime() - 10 * 60 * 1_000);
  const hourStart = new Date(startedAt.getTime() - 60 * 60 * 1_000);
  const [usage] = await transaction<RequestUsage[]>`
    select
      coalesce(sum(request_attempt_count) filter (
        where actor_key = ${actorKey}
          and task = ${task.task}
          and started_at >= ${windowStart.toISOString()}
      ), 0)::int as actor_requests,
      count(*) filter (
        where actor_key = ${actorKey} and status = 'running'
      )::int as actor_active,
      coalesce(sum(request_attempt_count) filter (
        where started_at >= ${hourStart.toISOString()}
          and task <> 'tick'
      ), 0)::int as home_requests,
      count(*) filter (
        where status = 'running' and task <> 'tick'
      )::int as home_active
    from public.runs
    where home_id = ${task.homeId}
  `;
  if (!usage) throw new Error("Failed to read agent request usage");
  return usage;
}

function assertRequestLimit(task: AgentTask, usage: RequestUsage): void {
  if (
    task.task !== "tick" &&
    (usage.actor_requests >= 5 ||
      usage.actor_active >= 2 ||
      usage.home_requests >= 30 ||
      usage.home_active >= 4)
  ) {
    throw new Error("Agent request limit reached; try again later");
  }
}

async function storedRunResult(
  transaction: TransactionSql,
  runId: string,
  sessionId: string,
  status: "completed" | "interrupted" | "failed",
  storedResult: unknown,
): Promise<RunResult> {
  const summary = objectString(storedResult, "summary") ?? "Agent run finished";
  const pendingDecisionIds =
    status === "interrupted"
      ? (
          await transaction<{ id: string }[]>`
            select id from public.pending_decisions
            where run_id = ${runId} and status = 'pending'
            order by created_at, id
          `
        ).map(({ id }) => id)
      : [];
  return { runId, sessionId, status, pendingDecisionIds, summary };
}

function objectString(value: unknown, key: string): string | undefined {
  if (typeof value === "string") {
    try {
      return objectString(JSON.parse(value), key);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function actorKeyForTask(task: AgentTask): string {
  const actor =
    task.task === "host_capture" || task.task === "host_room_request"
      ? `host:${task.hostId}`
      : task.task === "resume"
        ? `host:${task.responses
            .map(({ response }) => response.hostId)
            .sort()
            .join(",")}`
        : task.task === "tick"
          ? `job:${task.jobId}`
          : task.task === "guest_submit"
            ? `invitation:${task.invitationId}`
            : `visit:${task.visitId}`;
  return digest(actor);
}

async function intentKeyForTask(
  task: AgentTask,
  sql: ReturnType<typeof sqlClient>,
  startedAt: Date,
): Promise<string> {
  let state: unknown = null;
  if (task.task === "guest_change" || task.task === "guest_reconfirm") {
    const [visit] = await sql<
      {
        stay: string;
        status: string;
        adults: number;
        children: number;
        pets: number;
        special_requests: string[];
        reconfirm_requested_at: Date | null;
        reconfirmed_at: Date | null;
        escalated_at: Date | null;
      }[]
    >`
      select stay::text, status, adults, children, pets, special_requests,
        reconfirm_requested_at, reconfirmed_at, escalated_at
      from public.visits
      where id = ${task.visitId} and home_id = ${task.homeId}
    `;
    state = visit ?? null;
  }
  // Public submissions use a bounded retry window because this Server Action
  // path has no caller-generated submission ID. Retries inside the window are
  // one intent; identical input in a later window is a legitimate new intent.
  const retryWindow =
    task.task === "host_capture" ||
    task.task === "host_room_request" ||
    task.task === "guest_submit"
      ? Math.floor(startedAt.getTime() / (10 * 60 * 1_000))
      : null;
  return digest(JSON.stringify({ task, state, retryWindow }));
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function finish(
  sql: ReturnType<typeof sqlClient>,
  runId: string,
  sessionId: string,
  summary: string,
  now: Date,
  claimToken: string,
): Promise<RunResult> {
  const [completed] = await sql<{ id: string }[]>`
    update public.runs set status = 'completed', result = ${JSON.stringify({ summary })}::text::jsonb,
      finished_at = ${now.toISOString()}, heartbeat_at = ${now.toISOString()},
      queue_claimed_at = null, queue_claim_token = null, last_error = null
      where id = ${runId} and status = 'running'
        and queue_claim_token = ${claimToken}
      returning id
  `;
  if (!completed) throw new Error(`Agent run is no longer active: ${runId}`);
  return {
    runId,
    status: "completed",
    sessionId,
    pendingDecisionIds: [],
    summary,
  };
}

async function resolveSessionId(
  task: AgentTask,
  deps: AgentDeps,
): Promise<string> {
  if (task.task === "resume") return task.sessionId;
  if (task.task === "tick") return `tick_${task.jobId}`;
  if (task.task === "guest_submit") return `inv_${task.invitationId}`;
  const sql = sqlClient(deps.db);
  if (task.task === "guest_change" || task.task === "guest_reconfirm") {
    const [row] = await sql<{ invitation_id: string }[]>`
      select invitation_id from public.visits
      where id = ${task.visitId} and home_id = ${task.homeId}
    `;
    if (!row) throw new Error(`Visit not found: ${task.visitId}`);
    return `inv_${row.invitation_id}`;
  }
  return task.task === "host_room_request"
    ? `room_${task.hostId}`
    : `capture_${task.hostId}`;
}

async function authorityForTask(
  task: AgentTask,
  deps: AgentDeps,
): Promise<AgentAuthority> {
  const sql = sqlClient(deps.db);
  if (task.task === "host_capture" || task.task === "host_room_request") {
    const [host] = await sql<{ id: string }[]>`
      select id from public.hosts
      where id = ${task.hostId} and home_id = ${task.homeId}
    `;
    if (!host) throw new Error("Host does not belong to the task home");
    return { homeId: task.homeId, hostId: task.hostId };
  }
  if (task.task === "guest_submit") {
    const [invitation] = await sql<{ id: string; structured: unknown }[]>`
      select id, structured from public.invitations
      where id = ${task.invitationId} and home_id = ${task.homeId}
        and status <> 'cancelled'
    `;
    if (!invitation)
      throw new Error("Invitation does not belong to the task home");
    return {
      homeId: task.homeId,
      invitationId: task.invitationId,
      guestSubmission: canonicalGuestSubmission(task, invitation.structured),
    };
  }
  if (task.task === "guest_change" || task.task === "guest_reconfirm") {
    const [visit] = await sql<{ invitation_id: string }[]>`
      select invitation_id from public.visits
      where id = ${task.visitId} and home_id = ${task.homeId}
    `;
    if (!visit) throw new Error("Visit does not belong to the task home");
    return {
      homeId: task.homeId,
      invitationId: visit.invitation_id,
      visitId: task.visitId,
    };
  }
  if (task.task === "tick") {
    const [job] = await sql<{ visit_id: string }[]>`
      select visit_id from public.scheduled_jobs
      where id = ${task.jobId} and home_id = ${task.homeId}
    `;
    if (!job) throw new Error("Scheduled job does not belong to the task home");
    return { homeId: task.homeId, jobId: task.jobId, visitId: job.visit_id };
  }

  for (const { interruptId, response } of task.responses) {
    const [decision] = await sql<{ id: string }[]>`
      select id from public.pending_decisions
      where home_id = ${task.homeId}
        and agent_session_id = ${task.sessionId}
        and interrupt_id = ${interruptId}
    `;
    if (!decision) throw new Error("Decision does not belong to the task home");
    const [host] = await sql<{ id: string }[]>`
      select id from public.hosts
      where id = ${response.hostId} and home_id = ${task.homeId}
    `;
    if (!host)
      throw new Error("Decision host does not belong to the task home");
  }
  if (task.sessionId.startsWith("inv_")) {
    const invitationId = task.sessionId.slice(4);
    const [record] = await sql<
      { visit_id: string | null; structured: unknown }[]
    >`
      select v.id as visit_id, i.structured
      from public.invitations i
      left join public.visits v on v.invitation_id = i.id and v.home_id = i.home_id
      where i.id = ${invitationId} and i.home_id = ${task.homeId}
      order by v.created_at desc nulls last
      limit 1
    `;
    if (!record)
      throw new Error("Agent session invitation is outside the task home");
    const [submissionRun] = await sql<{ payload: unknown }[]>`
      select run.payload
      from public.pending_decisions decision
      join public.runs run on run.id = decision.run_id
      where decision.home_id = ${task.homeId}
        and decision.agent_session_id = ${task.sessionId}
        and decision.interrupt_id = ${task.responses[0]!.interruptId}
    `;
    const parsedSubmission = agentTaskSchema.safeParse(submissionRun?.payload);
    const trustedSpecialRequests = specialRequestsFromRunPayload(
      submissionRun?.payload,
    );
    return {
      homeId: task.homeId,
      invitationId,
      visitId: record.visit_id ?? undefined,
      guestSubmission:
        parsedSubmission.success &&
        parsedSubmission.data.task === "guest_submit"
          ? canonicalGuestSubmission(
              parsedSubmission.data,
              record.structured,
              trustedSpecialRequests,
            )
          : undefined,
    };
  }
  if (task.sessionId.startsWith("capture_")) {
    const hostId = task.sessionId.slice(8);
    const [host] = await sql<{ id: string }[]>`
      select id from public.hosts where id = ${hostId} and home_id = ${task.homeId}
    `;
    if (!host) throw new Error("Agent session host is outside the task home");
    return { homeId: task.homeId, hostId };
  }
  throw new Error("Unsupported agent session scope");
}

function invitationSpecialRequests(structured: unknown): string[] {
  if (
    !structured ||
    typeof structured !== "object" ||
    Array.isArray(structured)
  ) {
    return [];
  }
  const value = (structured as { specialRequests?: unknown }).specialRequests;
  return Array.isArray(value)
    ? value.filter((request): request is string => typeof request === "string")
    : [];
}

function canonicalGuestSubmission(
  task: Extract<AgentTask, { task: "guest_submit" }>,
  structured: unknown,
  trustedSpecialRequests?: string[],
): NonNullable<AgentAuthority["guestSubmission"]> {
  return {
    stay: task.stay,
    adults: task.adults,
    children: task.children,
    pets: task.pets,
    specialRequests:
      trustedSpecialRequests ??
      uniqueStrings([
        ...invitationSpecialRequests(structured),
        ...(task.notes ? [task.notes] : []),
      ]),
    roomIds: task.roomIds,
    overflowConsent: task.overflowConsent,
  };
}

function specialRequestsFromRunPayload(payload: unknown): string[] | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const value = (payload as { trustedSpecialRequests?: unknown })
    .trustedSpecialRequests;
  return Array.isArray(value) &&
    value.every((request) => typeof request === "string")
    ? uniqueStrings(value)
    : undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function buildPrompt(
  task: Exclude<AgentTask, { task: "resume" }>,
  deps: AgentDeps,
): Promise<string> {
  const sql = sqlClient(deps.db);
  if (task.task === "host_capture") {
    const [host] = await sql<{ display_name: string }[]>`
      select display_name from public.hosts
      where id = ${task.hostId} and home_id = ${task.homeId}
    `;
    return `${host?.display_name ?? "The host"} pasted this invitation (locale ${task.locale}): """${task.rawMessage}""". Structure it with capture_invitation and reply with a one-line summary for the host. The application will deliver the private link outside the model transcript.`;
  }
  if (task.task === "host_room_request") {
    return `The host requests this room action (locale ${task.locale}): """${task.rawMessage}""". Use list_guest_rooms or find_room_options to resolve only guest-safe room facts. Then call prepare_room_action exactly once with kind private_block, open, or close; an exact half-open stay; the selected room IDs; and a generic calendar-safe summary with no person's name or private detail. Prepare only. Do not apply the action and do not claim that any room was blocked, opened, or closed. Tell the host that the proposal needs visible confirmation.`;
  }
  if (task.task === "guest_submit") {
    const [party] = await sql<{ family_name: string }[]>`
      select p.family_name from public.invitations i join public.parties p on p.id = i.party_id
      where i.id = ${task.invitationId} and i.home_id = ${task.homeId}
    `;
    return `Party ${party?.family_name ?? "guest"} (invitation ${task.invitationId}) chose ${task.stay.join(" to ")}, ${task.adults} adults, ${task.children} children, ${task.pets} pets, arrival ${task.arrivalTime ?? "not given"}, notes: ${task.notes ?? "none"}. Place a hold, then confirm it, and tell the guest what happens next in their language.`;
  }
  if (
    task.task === "guest_change" ||
    (task.task === "guest_reconfirm" && task.answer === "change")
  ) {
    const [visit] = await sql<{ family_name: string }[]>`
      select p.family_name from public.visits v join public.parties p on p.id = v.party_id
      where v.id = ${task.visitId} and v.home_id = ${task.homeId}
    `;
    return `Party ${visit?.family_name ?? "guest"} asks to change visit ${task.visitId}: """${task.message ?? "Please change the stay"}""". Use find_visit_options if dates are unclear, then reschedule_visit.`;
  }
  if (task.task === "guest_reconfirm") return "Record the reconfirmation.";
  const [job] = await sql<
    {
      kind: string;
      visit_id: string;
      family_name: string;
      stay_start: string;
    }[]
  >`
    select j.kind, j.visit_id, p.family_name, lower(v.stay)::text as stay_start
    from public.scheduled_jobs j join public.visits v on v.id = j.visit_id
    join public.parties p on p.id = v.party_id
    where j.id = ${task.jobId} and j.home_id = ${task.homeId}
  `;
  if (!job) throw new Error(`Scheduled job not found: ${task.jobId}`);
  if (job.kind === "reconfirm_chase") {
    return `Visit ${job.visit_id} for ${job.family_name} starts ${job.stay_start}. Write the reconfirmation request to the party with notify (kind 'reconfirm_chase', scheduledJobId '${task.jobId}'); do not change the booking.`;
  }
  return `Visit ${job.visit_id} for ${job.family_name} was not reconfirmed within 24 hours. Tell both hosts with notify (kind 'reconfirm_escalation', scheduledJobId '${task.jobId}', one call per host) what is at stake and what they can do.`;
}
