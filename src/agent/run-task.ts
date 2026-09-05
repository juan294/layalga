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
import { invitationSpecialRequests } from "@/lib/json-object";
import { parseServerEnvironment } from "@/lib/server/env";

import { buildAgent } from "./agent";
import type { AgentAuthority, AgentDeps, ExecutionRuntime } from "./deps";
import { matchFamilyNameInMessage } from "./party-match";
import { recordCaptureMemory } from "./record-capture-memory";
import {
  agentTaskSchema,
  parseStoredRunResult,
  type AgentTask,
  type RunResult,
} from "./task";

export interface RunAgentDeps extends AgentDeps {
  model?: Model<BaseModelConfig>;
  executionRuntime?: ExecutionRuntime;
}

const AGENT_EXECUTION_FAILURE = {
  code: "agent_execution_failed",
  summary: "The agent could not complete this request.",
} as const;

/** Resolves the execution runtime for a deps object exactly once per entry point. */
function runtimeOf(deps: RunAgentDeps): ExecutionRuntime {
  return deps.executionRuntime ?? "local";
}

/** The `{ summary, executedOn }` shape every terminal run-result write carries. */
function terminalResultJson(
  summary: string,
  executedOn: ExecutionRuntime,
): { summary: string; executedOn: ExecutionRuntime } {
  return { summary, executedOn };
}

/**
 * Runs a household-memory write (`MemoryManager.flush()` or
 * `recordCaptureMemory`) and swallows any failure: a memory write is best
 * effort and must never fail the run it rides along with, the same
 * boundary `dispatchHostEmailPingsSafely` draws around email delivery
 * (`src/core/notifications/email-outbox.ts`). Logs once, with no content
 * (an error name only, matching the existing `[..._FAILED]` log shape).
 */
async function safeMemoryWrite(
  runId: string,
  stage: "flush" | "capture",
  write: () => Promise<void> | undefined,
): Promise<void> {
  try {
    await write();
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error("[MEMORY_WRITE_FAILED]", { runId, stage, errorName });
  }
}

/**
 * A run this call has already claimed for itself, before any other process
 * (in particular a queue drain) could see it: `runId`/`sessionId`/`task`
 * describe the run, and `claimToken` is the same token
 * `executeClaimedAgentTask` would otherwise get from `claimQueuedRun`.
 * `claimToken` is `null` when this is a still-in-flight duplicate of an
 * existing intent that this call did not itself claim (see
 * `enqueueAgentTaskInternal`'s "in-flight replay" case) -- the caller falls
 * back to the normal `executeQueuedAgentRun` claim attempt for that case,
 * exactly as before this fix.
 */
interface EnqueueStart {
  runId: string;
  sessionId: string;
  task: AgentTask;
  claimToken: string | null;
}

/**
 * Resolves authority and session id, then starts (or replays) the run, with
 * or without claiming it in the same insert/update (`options.claimImmediately`).
 * Shared by `enqueueAgentTask` (never claims immediately, so its return
 * shape is unchanged for every existing caller) and `runAgentTask` (always
 * claims immediately, for a run this process is about to execute
 * synchronously -- see the module doc below).
 */
async function enqueueAgentTaskInternal(
  payload: AgentTask,
  deps: RunAgentDeps,
  options: { claimImmediately: boolean },
): Promise<{ start: EnqueueStart } | { result: RunResult }> {
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
    claimImmediately: options.claimImmediately,
  });
  if (runStart.replay) {
    // A genuinely terminal replay (completed/interrupted/failed with no
    // retry) short-circuits with its final result. A still-in-flight
    // replay (another request already has this exact intent queued or
    // running) keeps its `queuedRunResult` shape and status "queued" --
    // this call never claims it immediately, whatever `claimImmediately`
    // was asked for, so the caller falls back to a normal claim attempt
    // (which itself safely no-ops into "already being executed" if the
    // other request still holds it).
    if (runStart.result.status !== "queued") return { result: runStart.result };
    return {
      start: {
        runId: runStart.result.runId,
        sessionId: runStart.result.sessionId,
        task,
        claimToken: null,
      },
    };
  }
  return {
    start: {
      runId: runStart.runId,
      sessionId,
      task,
      claimToken: runStart.claimToken,
    },
  };
}

/**
 * Runs a task to completion in this process. A synchronous caller (the
 * demo clock route ticking due jobs, a Server Action awaiting its own
 * result) must never have its run sit visible as `queued` even for one
 * round trip: the queue drain (`drainAgentQueue`, `src/agent/queue.ts`)
 * polls `status = 'queued' and queue_available_at <= now` every minute, and
 * a run inserted `queued` then claimed a moment later by *this* call was,
 * in that moment, a legitimate drain target -- in production the drain won
 * that race, dispatched the tick to AgentCore, and the synchronous
 * execution here then lost its own claim and failed with "Agent run is no
 * longer active".
 *
 * The fix inserts (or restarts) the row already claimed -- `status`
 * `running`, `queue_claim_token` set, `queue_claimed_at`/`heartbeat_at`/
 * `deadline_at` populated, `execution_attempt_count` 1 -- in the same
 * statement that starts it (`enqueueAgentTaskInternal` with
 * `claimImmediately: true`), so it is never visible in `queued` state to
 * anything. Execution then proceeds directly against that held claim
 * (`runClaimedTask`), skipping `claimQueuedRun`/`executeQueuedAgentRun`
 * entirely for the common case. No schema change: every column this needs
 * already exists (`queue_claim_token`, `queue_claimed_at`, `heartbeat_at`,
 * `deadline_at`, `execution_attempt_count`).
 *
 * `enqueueAgentTask` and `AgentCoreClient`/`LocalAgentClient`'s
 * queued-then-dispatch callers are unaffected: they never set
 * `claimImmediately`, so their runs still start `queued` and get claimed
 * later by whichever process (this one, opportunistically, or the drain)
 * gets there first -- unchanged from before this fix.
 */
export async function runAgentTask(
  payload: AgentTask,
  deps: RunAgentDeps,
): Promise<RunResult> {
  const outcome = await enqueueAgentTaskInternal(payload, deps, {
    claimImmediately: true,
  });
  if ("result" in outcome) return outcome.result;
  const { runId, sessionId, task, claimToken } = outcome.start;
  return claimToken
    ? runClaimedTask(task, deps, { id: runId, claimToken }, sessionId)
    : executeQueuedAgentRun(runId, deps);
}

export async function enqueueAgentTask(
  payload: AgentTask,
  deps: RunAgentDeps,
): Promise<RunResult> {
  const outcome = await enqueueAgentTaskInternal(payload, deps, {
    claimImmediately: false,
  });
  if ("result" in outcome) return outcome.result;
  return queuedRunResult(outcome.start.runId, outcome.start.sessionId);
}

export async function executeQueuedAgentRun(
  runId: string,
  deps: RunAgentDeps,
): Promise<RunResult> {
  const executedOn = runtimeOf(deps);
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
    await failClaimedRun(sql, runId, claimed.queue_claim_token, executedOn);
    throw new Error("Persisted agent task is invalid");
  }
  const task = parsed.data;
  if (task.homeId !== claimed.home_id) {
    await failClaimedRun(sql, runId, claimed.queue_claim_token, executedOn);
    throw new Error("Persisted agent task is outside its run home");
  }

  return runClaimedTask(
    task,
    deps,
    { id: runId, claimToken: claimed.queue_claim_token },
    claimed.session_id,
  );
}

/**
 * Executes a task the caller already holds the claim for -- whether from
 * `claimQueuedRun` (`executeQueuedAgentRun`) or from an immediate claim
 * taken at insert time (`runAgentTask`). Resolves authority fresh (never
 * trusts a persisted or in-memory authority across the claim boundary) and
 * marks the run failed on any error, the same recovery both callers relied
 * on before this was factored out.
 */
async function runClaimedTask(
  task: AgentTask,
  deps: RunAgentDeps,
  run: { id: string; claimToken: string },
  sessionId: string,
): Promise<RunResult> {
  try {
    const authority = await authorityForTask(task, deps);
    return await executeClaimedAgentTask(
      task,
      { ...deps, authority },
      run,
      sessionId,
    );
  } catch (error) {
    await failClaimedRun(
      sqlClient(deps.db),
      run.id,
      run.claimToken,
      runtimeOf(deps),
    );
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
  const executedOn = runtimeOf(deps);

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
        executedOn,
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
      homeId: task.homeId,
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
    // Extraction runs in the background; this is the one-shot-run boundary
    // where remaining buffered turns must be saved before the process moves
    // on. A no-op agent (MEMORY=none, or no store attached to this task).
    // A flush failure must never fail the run itself, the same way
    // dispatchHostEmailPingsSafely never fails the request that triggers it
    // (src/core/notifications/email-outbox.ts).
    await safeMemoryWrite(run.id, "flush", () => agent.memoryManager?.flush());

    if (result.stopReason === "interrupt") {
      return await sql.begin(async (sql) => {
        await sql`select pg_advisory_xact_lock(hashtextextended(${task.homeId}::text, 0))`;
        const [active] =
          await sql`select id from public.runs where id = ${run.id} and status = 'running' and queue_claim_token = ${run.claimToken}`;
        if (!active)
          throw new Error("The request was withdrawn while awaiting review");
        const ids: string[] = [];
        for (const interrupt of result.interrupts ?? []) {
          const [decision] = await sql<{ id: string }[]>`
          insert into public.pending_decisions (
            home_id, run_id, agent_session_id, interrupt_id, interrupt_name, reason
          ) select
            ${task.homeId}, ${run.id}, ${sessionId}, ${interrupt.id},
            ${interrupt.name}, ${JSON.stringify(interrupt.reason ?? null)}::text::jsonb
          where exists (select 1 from public.runs where id = ${run.id} and status = 'running' and queue_claim_token = ${run.claimToken})
          on conflict (agent_session_id, interrupt_id) do update
          set reason = excluded.reason
          returning id
        `;
          if (decision) ids.push(decision.id);
        }
        await sql`
        update public.runs set status = 'interrupted', result = ${JSON.stringify(
          terminalResultJson(result.toString(), executedOn),
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
          executedOn,
        };
      });
    }

    if (task.task === "resume") {
      for (const decision of resumeDecisions) {
        await sql.begin(async (transaction) => {
          const [applied] = await transaction<{ id: string }[]>`
            update public.pending_decisions
            set applied_run_id = ${run.id}, application_error = null
            where id = ${decision.id}
              and home_id = ${task.homeId}
              and applied_run_id = ${run.id} and status in ('approved', 'declined')
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
    if (task.task === "host_capture") {
      await safeMemoryWrite(run.id, "capture", () =>
        recordCaptureMemory(deps, run.id, sessionId, task.homeId),
      );
    }
    return await finish(
      sql,
      run.id,
      sessionId,
      result.toString(),
      deps.clock.now(),
      run.claimToken,
      executedOn,
    );
  } catch (error) {
    const summary = error instanceof Error ? error.message : String(error);
    await sql`
      update public.runs set status = 'failed', result = ${JSON.stringify({
        ...AGENT_EXECUTION_FAILURE,
        ...terminalResultJson(AGENT_EXECUTION_FAILURE.summary, executedOn),
      })}::text::jsonb,
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
  /**
   * Insert (or restart) the row already claimed -- `status` `running`,
   * `queue_claim_token` set, `queue_claimed_at`/`heartbeat_at`/
   * `deadline_at` populated, `execution_attempt_count` 1 -- in the same
   * statement, so it is never visible to the queue drain in a `queued`
   * state (see `runAgentTask`'s doc comment). `false` reproduces exactly
   * today's insert/update (status `queued`, every claim column left at
   * its default), unchanged for every caller but `runAgentTask`.
   */
  claimImmediately: boolean;
}

type StartRunResult =
  | { replay: false; runId: string; claimToken: string | null }
  | { replay: true; result: RunResult };

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
  executedOn: ExecutionRuntime,
): Promise<void> {
  await sql`
    update public.runs
    set status = 'failed', finished_at = now(),
      result = ${JSON.stringify({
        ...AGENT_EXECUTION_FAILURE,
        ...terminalResultJson(AGENT_EXECUTION_FAILURE.summary, executedOn),
      })}::text::jsonb,
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
  const {
    sql,
    task,
    sessionId,
    runPayload,
    startedAt,
    actorKey,
    intentKey,
    claimImmediately,
  } = input;
  // Reproduces exactly what `claimQueuedRun` would set a moment later, but
  // in the same insert/update statement that starts the row, so it is never
  // visible in `queued` state in between (see `runAgentTask`'s doc
  // comment). `null`/`0` when not claiming immediately -- the same values
  // an insert/update omitting these columns would leave -- so this is a
  // no-op for every caller except `runAgentTask`.
  const claimToken = claimImmediately ? randomUUID() : null;
  const status = claimImmediately ? "running" : "queued";
  const claimedAt = claimImmediately ? startedAt.toISOString() : null;
  const heartbeatAt = claimImmediately ? startedAt.toISOString() : null;
  const deadlineAt = claimImmediately
    ? new Date(startedAt.getTime() + 4 * 60 * 1_000).toISOString()
    : null;
  const executionAttemptCount = claimImmediately ? 1 : 0;

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
          set status = ${status}, result = null,
            started_at = ${startedAt.toISOString()}, finished_at = null,
            heartbeat_at = ${heartbeatAt}, deadline_at = ${deadlineAt},
            queue_available_at = ${startedAt.toISOString()},
            queue_claimed_at = ${claimedAt}, queue_claim_token = ${claimToken},
            execution_attempt_count = ${executionAttemptCount},
            last_error = null,
            payload = ${JSON.stringify(runPayload)}::text::jsonb,
            request_attempt_count = request_attempt_count + ${interactiveRetry ? 1 : 0}
          where id = ${existing.id} and status = ${existing.status}
          returning id
        `;
        if (!restarted) throw new Error("Failed to retry the agent request");
        return { replay: false, runId: restarted.id, claimToken };
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
        actor_key, intent_key, started_at,
        queue_claimed_at, queue_claim_token, heartbeat_at, deadline_at,
        execution_attempt_count
      ) values (
        ${task.homeId}, ${sessionId}, ${task.task}, ${status},
        ${JSON.stringify(runPayload)}::text::jsonb, ${startedAt.toISOString()},
        ${actorKey}, ${intentKey},
        ${startedAt.toISOString()},
        ${claimedAt}, ${claimToken}, ${heartbeatAt}, ${deadlineAt},
        ${executionAttemptCount}
      )
      returning id
    `;
    if (!created) throw new Error("Failed to start agent run");
    return { replay: false, runId: created.id, claimToken };
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
  const { summary = "Agent run finished", executedOn } =
    parseStoredRunResult(storedResult);
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
  return { runId, sessionId, status, pendingDecisionIds, summary, executedOn };
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
  executedOn: ExecutionRuntime,
): Promise<RunResult> {
  const [completed] = await sql<{ id: string }[]>`
    update public.runs set status = 'completed', result = ${JSON.stringify(
      terminalResultJson(summary, executedOn),
    )}::text::jsonb,
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
    executedOn,
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
    if (task.task === "host_room_request") {
      return { homeId: task.homeId, hostId: task.hostId };
    }
    const partyId = await matchedPartyIdForCapture(
      sql,
      task.homeId,
      task.rawMessage,
    );
    return { homeId: task.homeId, hostId: task.hostId, partyId };
  }
  if (task.task === "guest_submit") {
    const [invitation] = await sql<
      { id: string; party_id: string; structured: unknown }[]
    >`
      select id, party_id, structured from public.invitations
      where id = ${task.invitationId} and home_id = ${task.homeId}
        and status <> 'cancelled'
    `;
    if (!invitation)
      throw new Error("Invitation does not belong to the task home");
    return {
      homeId: task.homeId,
      invitationId: task.invitationId,
      partyId: invitation.party_id,
      guestSubmission: canonicalGuestSubmission(task, invitation.structured),
    };
  }
  if (task.task === "guest_change" || task.task === "guest_reconfirm") {
    const [visit] = await sql<{ invitation_id: string; party_id: string }[]>`
      select invitation_id, party_id from public.visits
      where id = ${task.visitId} and home_id = ${task.homeId} and status <> 'cancelled'
        and exists (select 1 from public.invitations i where i.id = visits.invitation_id and i.status <> 'cancelled')
    `;
    if (!visit)
      throw new Error(
        "Visit does not belong to the task home or was cancelled",
      );
    return {
      homeId: task.homeId,
      invitationId: visit.invitation_id,
      visitId: task.visitId,
      partyId: visit.party_id,
    };
  }
  if (task.task === "tick") {
    const [job] = await sql<{ visit_id: string; party_id: string }[]>`
      select job.visit_id, visit.party_id
      from public.scheduled_jobs job
      join public.visits visit on visit.id = job.visit_id
      where job.id = ${task.jobId} and job.home_id = ${task.homeId}
        and job.status <> 'cancelled' and visit.status <> 'cancelled'
        and exists (select 1 from public.invitations i where i.id = visit.invitation_id and i.status <> 'cancelled')
    `;
    if (!job) throw new Error("Scheduled job does not belong to the task home");
    return {
      homeId: task.homeId,
      jobId: task.jobId,
      visitId: job.visit_id,
      partyId: job.party_id,
    };
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
      { visit_id: string | null; party_id: string; structured: unknown }[]
    >`
      select v.id as visit_id, i.party_id, i.structured
      from public.invitations i
      left join public.visits v on v.invitation_id = i.id and v.home_id = i.home_id
      where i.id = ${invitationId} and i.home_id = ${task.homeId} and i.status <> 'cancelled'
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
      partyId: record.party_id,
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

/**
 * Deterministic pre-match for a `host_capture` task (D7 / A7): scopes the
 * task's memory authority to an existing party of the home only when its
 * family name already appears in the raw message, so a matched capture can
 * recall that party's remembered preferences before the model has run
 * `capture_invitation`. An unmatched capture (a brand-new family, or
 * wording that does not name an existing party) keeps `partyId` undefined
 * and falls back to a read-only whole-home memory scope.
 */
export async function matchedPartyIdForCapture(
  sql: ReturnType<typeof sqlClient>,
  homeId: string,
  rawMessage: string,
): Promise<string | undefined> {
  const parties = await sql<{ id: string; family_name: string }[]>`
    select id, family_name from public.parties where home_id = ${homeId}
  `;
  return parties.find((party) =>
    matchFamilyNameInMessage(party.family_name, rawMessage),
  )?.id;
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

/**
 * Appended to a prompt to ask the model to recall a matched party's memory
 * first (D7 / task 3.6), and to bound what that recall may affect: recalled
 * facts inform the host, they never overwrite what the host's own message
 * states. A recalled fact that changed adults, children, pets, dates,
 * arrival time, or specialRequests is exactly the bug this bounds against
 * (a demo run once turned a remembered "ground floor room" preference into
 * a specialRequests entry that interrupted for host approval the family
 * never asked to trigger).
 */
const SEARCH_MEMORY_INSTRUCTION =
  " Before doing anything else, call search_memory to check what this household remembers about this family (arrival habits, room needs, pets, accessibility), and take any relevant preference into account. Facts from search_memory never change adults, children, pets, dates, arrival time, or specialRequests: only what the message you were given states goes into those fields.";

/** Appended only to the host_capture search instruction (task 3.6 / D7 continued): where a recalled fact belongs. */
const REMEMBERED_CONTEXT_INSTRUCTION =
  " Put what the house remembers into rememberedContext and mention it in the one-line summary.";

/**
 * Appended to the guest_submit and guest_change prompts whenever memory is
 * on (a steer, since extraction reads the conversation regardless of what
 * this text says): those two tasks keep an extraction-backed writable
 * store (unlike host_capture, which never is -- see `src/agent/memory.ts`),
 * so anything the model writes in its own reply becomes part of what
 * extraction can turn into a long-term record. Memory search results and
 * earlier turns in the same session may already contain a personal name;
 * without this steer the model could repeat one back in its own message,
 * and that gets re-extracted, compounding the leak. It cannot erase a name
 * already in the conversation, only stop the model from reintroducing one.
 */
const MEMORY_NAME_STEER_INSTRUCTION =
  ' Memory search results and earlier turns in this conversation may contain personal names. In your own reply, refer to this family only as "this family", never by name.';

/**
 * Appended to the guest_submit and guest_change prompts: a steer, not the
 * enforcement. `notify` is for telling a host something, never a guest (a
 * production run once tried it anyway and surfaced the tool's refusal in
 * the guest-facing summary); this text asks the model not to bother trying.
 * The actual rule is enforced deterministically in the tool itself
 * (`assertGuestNotificationChannel`, `src/agent/tools/notify.ts`), which
 * refuses a `party` recipient for any `kind` but `reconfirm_chase`
 * regardless of what the model attempts. The application itself is what
 * tells the guest the outcome, through the private link.
 */
const NO_NOTIFY_INSTRUCTION =
  " Do not call notify. The application delivers the outcome through the private link.";

// A `resume` invocation carries no text prompt of its own (see the
// `InterruptResponseContent` branch in `executeClaimedAgentTask` below) --
// it continues the same agent session as the original guest interaction,
// so there is no per-turn string to append an instruction to the way the
// other tasks above do. That resume-only language and no-notify steer
// instead lives on the system prompt, appended in `buildAgent`
// (`src/agent/agent.ts`) from `RESUME_SYSTEM_PROMPT_SUFFIX`
// (`src/agent/system-prompt.ts`) -- kept out of this module specifically
// to avoid a circular import (`agent.ts` already imports `buildAgent` from
// this file).

async function buildPrompt(
  task: Exclude<AgentTask, { task: "resume" }>,
  deps: AgentDeps,
): Promise<string> {
  const sql = sqlClient(deps.db);
  const memoryEnabled = parseServerEnvironment().memory === "agentcore";
  if (task.task === "host_capture") {
    // The host's display name never enters the prompt (D7): the minimizer's
    // "pasted this invitation" regex is now a no-op for this text, kept for
    // the older shape any in-flight session snapshot may still carry.
    const searchInstruction =
      memoryEnabled && deps.authority?.partyId
        ? SEARCH_MEMORY_INSTRUCTION + REMEMBERED_CONTEXT_INSTRUCTION
        : "";
    return `The host pasted this invitation (locale ${task.locale}): """${task.rawMessage}""". Structure it with capture_invitation and reply with a one-line summary for the host. The application will deliver the private link outside the model transcript.${searchInstruction}`;
  }
  if (task.task === "host_room_request") {
    return `The host requests this room action (locale ${task.locale}): """${task.rawMessage}""". Use list_guest_rooms or find_room_options to resolve only guest-safe room facts. Then call prepare_room_action exactly once with kind private_block, open, or close; an exact half-open stay; the selected room IDs; and a generic calendar-safe summary with no person's name or private detail. Prepare only. Do not apply the action and do not claim that any room was blocked, opened, or closed. Tell the host that the proposal needs visible confirmation.`;
  }
  if (task.task === "guest_submit") {
    // The family name never enters the prompt (D7): the minimizer's
    // "Party ... chose" regex is now a no-op for this text, kept for the
    // older shape any in-flight session snapshot may still carry.
    const searchInstruction = memoryEnabled ? SEARCH_MEMORY_INSTRUCTION : "";
    const nameSteer = memoryEnabled ? MEMORY_NAME_STEER_INSTRUCTION : "";
    return `The invited party (invitation ${task.invitationId}) chose ${task.stay.join(" to ")}, ${task.adults} adults, ${task.children} children, ${task.pets} pets, arrival ${task.arrivalTime ?? "not given"}, notes: ${task.notes ?? "none"}. Place a hold, then confirm it, and tell the guest what happens next in their language.${searchInstruction}${nameSteer}${NO_NOTIFY_INSTRUCTION}`;
  }
  if (
    task.task === "guest_change" ||
    (task.task === "guest_reconfirm" && task.answer === "change")
  ) {
    // The family name never enters the prompt (D7): the minimizer's
    // "Party ... asks to change" regex is now a no-op for this text, kept
    // for the older shape any in-flight session snapshot may still carry.
    const nameSteer = memoryEnabled ? MEMORY_NAME_STEER_INSTRUCTION : "";
    return `The invited party asks to change visit ${task.visitId}: """${task.message ?? "Please change the stay"}""". If this message means the guest cannot attend, wants to withdraw, or may mean cancellation, call prepare_cancellation, then explain the exact review and confirmation step. Never reschedule a cancellation request. No cancellation happens until the guest explicitly confirms in their invitation. Otherwise use find_visit_options if dates are unclear, then reschedule_visit.${nameSteer}${NO_NOTIFY_INSTRUCTION}`;
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
