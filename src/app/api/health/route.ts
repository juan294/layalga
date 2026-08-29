import { getDatabaseConnection } from "@/core/db/client";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "degraded";

export interface OperationsHealth {
  staleRuns: number;
  staleJobs: number;
  retryingJobs: number;
}

function healthResponse(status: HealthStatus, operations?: OperationsHealth) {
  return Response.json(
    {
      status,
      commit: process.env.VERCEL_GIT_COMMIT_SHA,
      operations,
    },
    { status: status === "ok" ? 200 : 503 },
  );
}

export async function GET() {
  try {
    const operations = await checkDatabaseHealth();
    const status = hasOperationalFailures(operations) ? "degraded" : "ok";
    if (status === "degraded") {
      console.error("[HEALTH_OPERATIONS_DEGRADED]", operations);
    }
    return healthResponse(status, operations);
  } catch (error) {
    console.error("[HEALTH_DATABASE_FAILED]", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return healthResponse("degraded");
  }
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
        ) as retrying_jobs
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
  return Object.values(operations).some((count) => count > 0);
}
