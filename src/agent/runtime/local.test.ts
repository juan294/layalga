import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RunAgentDeps } from "../run-task";
import type { AgentTask, RunResult } from "../task";
import { LocalAgentClient } from "./local";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  enqueueAgentTask: vi.fn(),
  executeQueuedAgentRun: vi.fn(),
  runAgentTask: vi.fn(),
  runtimeDeps: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("../queue", () => ({
  enqueueAgentTask: mocks.enqueueAgentTask,
  executeQueuedAgentRun: mocks.executeQueuedAgentRun,
}));
vi.mock("../run-task", () => ({ runAgentTask: mocks.runAgentTask }));
vi.mock("./deps", () => ({ runtimeDeps: mocks.runtimeDeps }));

const task: AgentTask = {
  task: "host_capture",
  homeId: "11111111-1111-4111-8111-111111111111",
  hostId: "22222222-2222-4222-8222-222222222222",
  rawMessage: "Please record this stay.",
  locale: "en",
};

const deps = { appUrl: "http://localhost:3008" } as RunAgentDeps;
const result = {
  runId: "run-1",
  status: "queued",
  sessionId: "session-1",
  pendingDecisionIds: [],
  summary: "Queued",
} as RunResult;

describe("LocalAgentClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtimeDeps.mockResolvedValue(deps);
    mocks.after.mockImplementation((callback: () => unknown) => {
      void callback();
    });
  });

  it("runs with local runtime dependencies", async () => {
    const completed = { ...result, status: "completed" } as RunResult;
    mocks.runAgentTask.mockResolvedValue(completed);

    await expect(new LocalAgentClient().run(task)).resolves.toBe(completed);
    expect(mocks.runtimeDeps).toHaveBeenCalledWith(task, { executionRuntime: "local" });
    expect(mocks.runAgentTask).toHaveBeenCalledWith(task, deps);
  });

  it("opportunistically executes a queued result after the response", async () => {
    mocks.enqueueAgentTask.mockResolvedValue(result);
    mocks.executeQueuedAgentRun.mockResolvedValue({ ...result, status: "completed" });

    await expect(new LocalAgentClient().enqueue(task)).resolves.toBe(result);
    await Promise.resolve();
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.executeQueuedAgentRun).toHaveBeenCalledWith(result.runId, deps);
  });

  it("logs a failed opportunistic execution without changing the queued result", async () => {
    mocks.enqueueAgentTask.mockResolvedValue(result);
    mocks.executeQueuedAgentRun.mockRejectedValue(new Error("execution failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await new LocalAgentClient().enqueue(task);
      await Promise.resolve();
      expect(error).toHaveBeenCalledWith("[AGENT_QUEUE_AFTER_FAILED]", {
        runId: result.runId,
        errorName: "Error",
      });
    } finally {
      error.mockRestore();
    }
  });

  it("can disable opportunistic execution and does not schedule non-queued results", async () => {
    const completed = { ...result, status: "completed" } as RunResult;
    mocks.enqueueAgentTask.mockResolvedValueOnce(result);
    await new LocalAgentClient().enqueue(task, { opportunistic: false });
    expect(mocks.after).not.toHaveBeenCalled();

    mocks.enqueueAgentTask.mockResolvedValueOnce(completed);
    await new LocalAgentClient().enqueue(task);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("executes a queued run with local dependencies", async () => {
    const completed = { ...result, status: "completed" } as RunResult;
    mocks.executeQueuedAgentRun.mockResolvedValue(completed);

    await expect(new LocalAgentClient().executeQueued("run-1", task)).resolves.toBe(completed);
    expect(mocks.runtimeDeps).toHaveBeenCalledWith(task, { executionRuntime: "local" });
    expect(mocks.executeQueuedAgentRun).toHaveBeenCalledWith("run-1", deps);
  });
});
