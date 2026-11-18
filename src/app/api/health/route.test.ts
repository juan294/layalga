import { describe, expect, it, vi } from "vitest";

import {
  checkDatabaseHealth,
  healthStatus,
  QUEUE_STALL_SECONDS,
  type OperationsHealth,
} from "./health";

const idle: OperationsHealth = {
  staleRuns: 0,
  staleJobs: 0,
  retryingJobs: 0,
  oldestUnclaimedWorkSeconds: 0,
};
const ready = { ready: true, issues: [] };

describe("database health check", () => {
  it("degrades when mode-aware configuration is not ready", () => {
    expect(
      healthStatus(
        {
          ready: false,
          issues: [{ key: "AGENT_RUNTIME", code: "missing" }],
        },
        idle,
      ),
    ).toBe("degraded");
  });

  it("tolerates the normal one-minute scheduling delay and a short backlog", () => {
    for (const seconds of [0, 59, 120, QUEUE_STALL_SECONDS]) {
      expect(
        healthStatus(ready, { ...idle, oldestUnclaimedWorkSeconds: seconds }),
      ).toBe("ok");
    }
  });

  it("degrades when accepted work stays unclaimed past the stall threshold", () => {
    expect(
      healthStatus(ready, {
        ...idle,
        oldestUnclaimedWorkSeconds: QUEUE_STALL_SECONDS + 1,
      }),
    ).toBe("degraded");
  });

  it("runs one query", async () => {
    const query = vi.fn(async () => [
      {
        accessible: true,
        stale_runs: 0,
        stale_jobs: 1,
        retrying_jobs: 2,
        oldest_unclaimed_work_seconds: 75,
      },
    ]);

    await expect(checkDatabaseHealth(query, 50)).resolves.toEqual({
      staleRuns: 0,
      staleJobs: 1,
      retryingJobs: 2,
      oldestUnclaimedWorkSeconds: 75,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects an inaccessible database result", async () => {
    await expect(
      checkDatabaseHealth(async () => [{ accessible: false }], 50),
    ).rejects.toThrow("Database is not accessible");
  });

  it("cancels a query that exceeds the health deadline", async () => {
    const cancel = vi.fn();
    const pending = Object.assign(new Promise<never>(() => undefined), {
      cancel,
    });

    await expect(checkDatabaseHealth(() => pending, 5)).rejects.toThrow(
      "Database health check timed out",
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
