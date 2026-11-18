import { getDatabaseConnection } from "@/core/db/client";
import type { EnvironmentReadiness } from "@/lib/server/env";

export type HealthStatus = "ok" | "degraded";

export interface OperationsHealth {
  staleRuns: number;
  staleJobs: number;
  retryingJobs: number;
  /** Age of the oldest claimable queued run or due job that no tick has taken. */
  oldestUnclaimedWorkSeconds: number;
}

/**
 * Cron runs every minute and a drain takes at most two runs, each running up
 * to four minutes. Work older than ten minutes means ticks are not draining.
 */
export const QUEUE_STALL_SECONDS = 600;

export function healthStatus(
  configuration: EnvironmentReadiness,
  operations: OperationsHealth,
): HealthStatus {
  return configuration.ready && !hasOperationalFailures(operations)
    ? "ok"
    : "degraded";
}

interface CancellablePromise<T> extends Promise<T> {
  cancel?: () => void;
}

type HealthQuery = () => CancellablePromise<unknown> | Promise<unknown>;

export async function checkDatabaseHealth(
  query: HealthQuery = () => {
    const sql = getDatabaseConnection().sql;
    return sql`
      select
        exists (select 1 from public.homes limit 1) as accessible,
        (
          select count(*)::int from public.runs
          where status = 'running' and deadline_at <= now()
        ) as stale_runs,
        (
          select count(*)::int from public.scheduled_jobs
          where status = 'running'
            and claimed_at <= now() - interval '10 minutes'
        ) as stale_jobs,
        (
          select count(*)::int from public.scheduled_jobs
          where status = 'scheduled' and last_error is not null
        ) as retrying_jobs,
        (
          select coalesce(
            floor(extract(epoch from now() - min(ready_at)))::int, 0
          )
          from (
            select queue_available_at as ready_at
            from public.runs
            where status = 'queued' and execution_attempt_count < 3
              and queue_available_at <= now()
            union all
            select due_at
            from public.scheduled_jobs
            where status = 'scheduled'
              and due_at <= now() and available_at <= now()
          ) as unclaimed
        ) as oldest_unclaimed_work_seconds
    `;
  },
  timeoutMs = 2_000,
): Promise<OperationsHealth> {
  const pending = query() as CancellablePromise<unknown>;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      pending.cancel?.();
      reject(new Error("Database health check timed out"));
    }, timeoutMs);
  });

  try {
    return operationsFromResult(await Promise.race([pending, deadline]));
  } finally {
    clearTimeout(timeout);
  }
}

function operationsFromResult(result: unknown): OperationsHealth {
  const row = Array.isArray(result) ? result[0] : null;
  if (!row || typeof row !== "object" || !("accessible" in row)) {
    throw new Error("Database health query returned an invalid result");
  }
  const values = row as Record<string, unknown>;
  if (values.accessible !== true) {
    throw new Error("Database is not accessible");
  }
  return {
    staleRuns: healthCount(values.stale_runs),
    staleJobs: healthCount(values.stale_jobs),
    retryingJobs: healthCount(values.retrying_jobs),
    oldestUnclaimedWorkSeconds: healthCount(
      values.oldest_unclaimed_work_seconds,
    ),
  };
}

function healthCount(value: unknown): number {
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Database health query returned an invalid count");
  }
  return count;
}

function hasOperationalFailures(operations: OperationsHealth): boolean {
  return (
    operations.staleRuns > 0 ||
    operations.staleJobs > 0 ||
    operations.retryingJobs > 0 ||
    operations.oldestUnclaimedWorkSeconds > QUEUE_STALL_SECONDS
  );
}
