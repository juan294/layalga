import { describe, expect, it, vi } from "vitest";

import type { RunAgentDeps } from "./run-task";
import type { AgentTask } from "./task";
import { AgentCoreClient } from "./client";

const task: AgentTask = {
  task: "tick",
  homeId: "11111111-1111-4111-8111-111111111111",
  jobId: "22222222-2222-4222-8222-222222222222",
};
const runId = "33333333-3333-4333-8333-333333333333";

describe("AgentCoreClient", () => {
  it("resolves a bare tick task to the terminal RunResult AgentCore returns", async () => {
    const runResult = {
      runId,
      status: "completed" as const,
      sessionId: `tick_${task.jobId}`,
      pendingDecisionIds: [],
      summary: "Tick complete.",
      executedOn: "agentcore" as const,
    };
    const invoke = vi.fn(async () => runResult);
    const client = new AgentCoreClient("runtime", "eu-west-1", { invoke });

    await expect(client.run(task)).resolves.toEqual(runResult);
    expect(invoke).toHaveBeenCalledWith(task);
  });
});

describe("AgentCoreClient durable queue", () => {
  it("acknowledges persistence before post-response dispatch and owns its lifetime", async () => {
    const persisted = Promise.withResolvers<import("./task").RunResult>();
    const execution = Promise.withResolvers<unknown>();
    let callback: (() => Promise<void>) | undefined;
    const invoke = vi.fn(() => execution.promise);
    const client = new AgentCoreClient("runtime", "eu-west-1", {
      invoke,
      depsForTask: async () => ({}) as RunAgentDeps,
      persist: () => persisted.promise,
      scheduleDispatch: (work) => {
        callback = work;
      },
    });
    let acknowledged = false;
    const response = client.enqueue(task).then((result) => {
      acknowledged = true;
      return result;
    });
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    expect(callback).toBeUndefined();
    persisted.resolve({
      runId,
      status: "queued",
      sessionId: "session",
      pendingDecisionIds: [],
      summary: "Queued",
    });
    // Resolve the network eventually even on RED, so no background task leaks.
    const result = await Promise.race([
      response,
      new Promise<"blocked">((resolve) =>
        setTimeout(() => resolve("blocked"), 100),
      ),
    ]);
    if (result === "blocked") execution.resolve({ status: "accepted", runId });
    await response;
    expect(result).toMatchObject({ status: "queued", runId });
    expect(invoke).not.toHaveBeenCalled();
    let dispatchFinished = false;
    const dispatch = callback!().then(() => {
      dispatchFinished = true;
    });
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith({
      operation: "execute_run",
      runId,
      task,
    });
    expect(dispatchFinished).toBe(false);
    execution.resolve({ status: "accepted", runId });
    await dispatch;
    expect(dispatchFinished).toBe(true);
  });

  it("logs post-response failures while leaving the persisted run recoverable", async () => {
    let callback: (() => Promise<void>) | undefined;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoke = vi.fn().mockRejectedValue(new Error("runtime unavailable"));
    try {
      const client = new AgentCoreClient("runtime", "eu-west-1", {
        invoke,
        depsForTask: async () => ({}) as RunAgentDeps,
        persist: async () => ({
          runId,
          status: "queued",
          sessionId: "session",
          pendingDecisionIds: [],
          summary: "Queued",
        }),
        scheduleDispatch: (work) => {
          callback = work;
        },
      });
      await expect(client.enqueue(task)).resolves.toMatchObject({
        status: "queued",
        runId,
      });
      await callback!();
      expect(errorSpy).toHaveBeenCalledWith(
        "[AGENTCORE_QUEUE_DISPATCH_FAILED]",
        { runId, errorName: "Error" },
      );
      invoke.mockResolvedValue({ status: "accepted", runId });
      await expect(client.executeQueued(runId, task)).resolves.toEqual({
        status: "accepted",
        runId,
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("persists once and dispatches the same run ID", async () => {
    const persist = vi.fn(async () => ({
      runId,
      status: "queued" as const,
      sessionId: "session",
      pendingDecisionIds: [],
      summary: "Your request is queued.",
    }));
    const invoke = vi.fn(async () => ({ status: "accepted", runId }));
    const client = new AgentCoreClient("runtime", "eu-west-1", {
      invoke,
      depsForTask: async () => ({}) as RunAgentDeps,
      persist,
    });

    const result = await client.enqueue(task);

    expect(result).toMatchObject({ status: "queued", runId });
    expect(persist).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith({
      operation: "execute_run",
      runId,
      task,
    });
  });

  it("recovers an existing run without persisting a second run", async () => {
    const persist = vi.fn();
    const invoke = vi.fn(async () => ({ status: "accepted", runId }));
    const client = new AgentCoreClient("runtime", "eu-west-1", {
      invoke,
      depsForTask: async () => ({}) as RunAgentDeps,
      persist,
    });

    await expect(client.executeQueued(runId, task)).resolves.toEqual({
      status: "accepted",
      runId,
    });
    expect(persist).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith({
      operation: "execute_run",
      runId,
      task,
    });
  });

  it("lets cron persist without dispatch before its bounded drain", async () => {
    const persist = vi.fn(async () => ({
      runId,
      status: "queued" as const,
      sessionId: "session",
      pendingDecisionIds: [],
      summary: "Your request is queued.",
    }));
    const invoke = vi.fn(async () => ({ status: "accepted", runId }));
    const client = new AgentCoreClient("runtime", "eu-west-1", {
      invoke,
      depsForTask: async () => ({}) as RunAgentDeps,
      persist,
    });

    await client.enqueue(task, { opportunistic: false });
    expect(invoke).not.toHaveBeenCalled();

    await client.executeQueued(runId, task);
    expect(persist).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("rejects an invocation that acknowledges a different run", async () => {
    const client = new AgentCoreClient("runtime", "eu-west-1", {
      invoke: async () => ({ status: "accepted", runId: "other-run" }),
    });

    await expect(client.executeQueued(runId, task)).rejects.toThrow(
      "did not accept the queued run",
    );
  });

  it("keeps the persisted result when opportunistic dispatch fails", async () => {
    const error = new Error("runtime unavailable");
    const persist = vi.fn(async () => ({
      runId,
      status: "queued" as const,
      sessionId: "session",
      pendingDecisionIds: [],
      summary: "Your request is queued.",
    }));
    const invoke = vi.fn().mockRejectedValue(error);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const client = new AgentCoreClient("runtime", "eu-west-1", {
        invoke,
        depsForTask: async () => ({}) as RunAgentDeps,
        persist,
      });

      await expect(client.enqueue(task)).resolves.toMatchObject({
        status: "queued",
        runId,
      });
      expect(errorSpy).toHaveBeenCalledWith(
        "[AGENTCORE_QUEUE_DISPATCH_FAILED]",
        { runId, errorName: "Error" },
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("parseAgentCoreResponse", () => {
  it("parses ordinary JSON responses", async () => {
    const { parseAgentCoreResponse } = await import("./client");
    expect(parseAgentCoreResponse('{"status":"completed"}')).toEqual({
      status: "completed",
    });
  });

  it("uses the last non-empty data event from an SSE response", async () => {
    const { parseAgentCoreResponse } = await import("./client");
    expect(
      parseAgentCoreResponse(
        'event: message\ndata: {"status":"queued"}\n\ndata: {"status":"completed"}\n',
        "text/event-stream; charset=utf-8",
      ),
    ).toEqual({ status: "completed" });
  });

  it("rejects an empty SSE response", async () => {
    const { parseAgentCoreResponse } = await import("./client");
    expect(() =>
      parseAgentCoreResponse("event: done\n", "text/event-stream"),
    ).toThrow("empty SSE data");
  });
});
