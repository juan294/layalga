import type { Clock } from "@/core/clock";
import { sqlClient, type DatabaseClient } from "@/core/db/client";

import { enqueueAgentTask, executeQueuedAgentRun } from "./run-task";
import type { AgentRunAccepted } from "./runtime/async-execution";
import { agentTaskSchema, type AgentTask, type RunResult } from "./task";

export { enqueueAgentTask, executeQueuedAgentRun };

export interface QueueDrainResult {
  claimedRunIds: string[];
  completed: number;
  interrupted: number;
  dispatched: number;
  failed: number;
}

export type QueuedAgentExecutor = (
  runId: string,
  task: AgentTask,
) => Promise<RunResult | AgentRunAccepted>;

export async function drainAgentQueue(
  database: DatabaseClient,
  clock: Clock,
  execute: QueuedAgentExecutor,
  options: { concurrency?: number } = {},
): Promise<QueueDrainResult> {
  const sql = sqlClient(database);
  const concurrency = Math.min(Math.max(options.concurrency ?? 2, 1), 4);
  const now = clock.now();
  const staleBefore = new Date(now.getTime() - 6 * 60 * 1_000);
  const candidates = await sql<{ id: string; payload: unknown }[]>`
    select id, payload from public.runs
    where execution_attempt_count < 3
      and (
        (status = 'queued' and queue_available_at <= ${now.toISOString()})
        or (
          status = 'running'
          and queue_claimed_at <= ${staleBefore.toISOString()}
        )
      )
    order by queue_available_at, started_at, id
    limit ${concurrency}
  `;

  const claimedRunIds: string[] = [];
  let completed = 0;
  let interrupted = 0;
  let dispatched = 0;
  let failed = 0;
  await Promise.all(
    candidates.map(async (candidate) => {
      const parsed = agentTaskSchema.safeParse(candidate.payload);
      if (!parsed.success) {
        const invalidated = await sql<{ id: string }[]>`
          update public.runs
          set status = 'failed', finished_at = ${now.toISOString()},
            result = ${JSON.stringify({
              code: "invalid_persisted_task",
              summary: "The queued request could not be read.",
            })}::text::jsonb,
            queue_claimed_at = null, queue_claim_token = null,
            last_error = 'Invalid persisted agent task'
          where id = ${candidate.id}
            and (
              status = 'queued'
              or (
                status = 'running'
                and queue_claimed_at <= ${staleBefore.toISOString()}
              )
            )
          returning id
        `;
        failed += invalidated.length;
        return;
      }
      try {
        const result = await execute(candidate.id, parsed.data);
        claimedRunIds.push(candidate.id);
        if (result.status === "completed") completed += 1;
        if (result.status === "interrupted") interrupted += 1;
        if (result.status === "accepted") dispatched += 1;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("already being executed")
        ) {
          claimedRunIds.push(candidate.id);
          failed += 1;
        }
      }
    }),
  );

  return { claimedRunIds, completed, interrupted, dispatched, failed };
}
