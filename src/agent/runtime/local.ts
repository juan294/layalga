import { after } from "next/server";

import { enqueueAgentTask, executeQueuedAgentRun } from "../queue";
import { runAgentTask } from "../run-task";
import type { AgentTask, RunResult } from "../task";
import type { AgentRunAccepted } from "./async-execution";
import { runtimeDeps } from "./deps";

export interface AgentClient {
  run(payload: AgentTask): Promise<RunResult>;
  enqueue(
    payload: AgentTask,
    options?: { opportunistic?: boolean },
  ): Promise<RunResult>;
  executeQueued(
    runId: string,
    payload: AgentTask,
  ): Promise<RunResult | AgentRunAccepted>;
}

export class LocalAgentClient implements AgentClient {
  async run(payload: AgentTask): Promise<RunResult> {
    return runAgentTask(
      payload,
      await runtimeDeps(payload, { executionRuntime: "local" }),
    );
  }

  async enqueue(
    payload: AgentTask,
    options: { opportunistic?: boolean } = {},
  ): Promise<RunResult> {
    const deps = await runtimeDeps(payload, { executionRuntime: "local" });
    const result = await enqueueAgentTask(payload, deps);
    if (result.status === "queued" && options.opportunistic !== false) {
      after(() =>
        executeQueuedAgentRun(result.runId, deps).catch((error: unknown) => {
          console.error("[AGENT_QUEUE_AFTER_FAILED]", {
            runId: result.runId,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }),
      );
    }
    return result;
  }

  async executeQueued(runId: string, payload: AgentTask): Promise<RunResult> {
    return executeQueuedAgentRun(
      runId,
      await runtimeDeps(payload, { executionRuntime: "local" }),
    );
  }
}
