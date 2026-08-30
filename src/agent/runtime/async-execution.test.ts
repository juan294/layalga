import { describe, expect, it, vi } from "vitest";

import { acceptAgentRunExecution } from "./async-execution";

describe("AgentCore queued-run execution", () => {
  it("acknowledges an existing run without waiting for model execution", async () => {
    let finishExecution!: () => void;
    const modelExecution = new Promise<void>((resolve) => {
      finishExecution = resolve;
    });
    let tracked: Promise<void> | undefined;
    const completeAsyncTask = vi.fn();
    const execute = vi.fn(async () => {
      await modelExecution;
      return {
        runId: "33333333-3333-4333-8333-333333333333",
        status: "completed" as const,
        sessionId: "session",
        pendingDecisionIds: [],
        summary: "Done",
      };
    });

    const accepted = acceptAgentRunExecution(
      {
        operation: "execute_run",
        runId: "33333333-3333-4333-8333-333333333333",
        task: {
          task: "tick",
          homeId: "11111111-1111-4111-8111-111111111111",
          jobId: "22222222-2222-4222-8222-222222222222",
        },
      },
      {
        addAsyncTask: vi.fn(() => 1),
        completeAsyncTask,
        execute,
        track: (execution) => {
          tracked = execution;
        },
        reportFailure: vi.fn(),
      },
    );

    expect(accepted).toEqual({
      status: "accepted",
      runId: "33333333-3333-4333-8333-333333333333",
    });
    await Promise.resolve();
    expect(execute).toHaveBeenCalledOnce();
    expect(completeAsyncTask).not.toHaveBeenCalled();

    finishExecution();
    await tracked;
    expect(completeAsyncTask).toHaveBeenCalledWith(1);
  });
});
