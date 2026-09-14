import { describe, expect, it, vi } from "vitest";

import { FakeClock } from "@/core/clock";
import type { DatabaseClient } from "@/core/db/client";

import { drainAgentQueue, type QueuedAgentExecutor } from "./queue";
import type { AgentTask, RunResult } from "./task";

const homeId = "11111111-1111-4111-8111-111111111111";
const hostId = "22222222-2222-4222-8222-222222222222";

function hostTask(rawMessage: string): AgentTask {
  return {
    task: "host_capture",
    homeId,
    hostId,
    rawMessage,
    locale: "en",
  };
}

function completedResult(
  runId: string,
  status: "completed" | "interrupted",
): RunResult {
  return {
    runId,
    status,
    sessionId: `session-${runId}`,
    pendingDecisionIds: [],
    summary: status,
  };
}

function fakeDatabase(
  candidates: { id: string; payload: unknown }[],
  invalidated: { id: string }[] = [],
): DatabaseClient {
  const sql = vi.fn((strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    return query.includes("select id, payload from public.runs")
      ? candidates
      : invalidated;
  });
  return sql as unknown as DatabaseClient;
}

describe("drainAgentQueue", () => {
  it("counts completed, interrupted, dispatched, and failed executions", async () => {
    const candidates = [
      { id: "completed", payload: hostTask("completed") },
      { id: "interrupted", payload: hostTask("interrupted") },
      { id: "accepted", payload: hostTask("accepted") },
      { id: "failed", payload: hostTask("failed") },
    ];
    const execute = vi.fn(async (runId: string) => {
      if (runId === "completed") return completedResult(runId, "completed");
      if (runId === "interrupted") return completedResult(runId, "interrupted");
      if (runId === "accepted") return { status: "accepted", runId } as const;
      throw new Error("execution failed");
    }) as unknown as QueuedAgentExecutor;

    const result = await drainAgentQueue(
      fakeDatabase(candidates),
      new FakeClock(new Date("2026-09-13T10:00:00Z")),
      execute,
      { concurrency: 10 },
    );

    expect(execute).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      claimedRunIds: expect.arrayContaining(["completed", "interrupted", "accepted", "failed"]),
      completed: 1,
      interrupted: 1,
      dispatched: 1,
      failed: 1,
    });
  });

  it("invalidates malformed rows and ignores an already-claimed duplicate", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("already being executed"))
      .mockRejectedValueOnce("not an Error") as unknown as QueuedAgentExecutor;
    const result = await drainAgentQueue(
      fakeDatabase(
        [
          { id: "duplicate", payload: hostTask("duplicate") },
          { id: "invalid", payload: { task: "unknown" } },
          { id: "unknown-error", payload: hostTask("unknown-error") },
        ],
        [{ id: "invalid" }],
      ),
      new FakeClock(new Date("2026-09-13T10:00:00Z")),
      execute,
      { concurrency: 3 },
    );

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      claimedRunIds: ["unknown-error"],
      completed: 0,
      interrupted: 0,
      dispatched: 0,
      failed: 2,
    });
  });

  it("clamps concurrency to at least one candidate", async () => {
    const execute = vi.fn(async (runId: string) =>
      completedResult(runId, "completed"),
    ) as unknown as QueuedAgentExecutor;
    const result = await drainAgentQueue(
      fakeDatabase([{ id: "one", payload: hostTask("one") }]),
      new FakeClock(new Date("2026-09-13T10:00:00Z")),
      execute,
      { concurrency: 0 },
    );

    expect(result.completed).toBe(1);
    expect(execute).toHaveBeenCalledWith("one", hostTask("one"));
  });
});
