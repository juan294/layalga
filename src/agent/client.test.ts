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

describe("AgentCoreClient durable queue", () => {
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
});
