import { after } from "next/server";

import { enqueueAgentTask, executeQueuedAgentRun } from "../queue";
import { runAgentTask } from "../run-task";
import type { AgentTask, RunResult } from "../task";
import type { AgentRunAccepted } from "./async-execution";
import { localRuntimeDeps } from "./local-deps";

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
      await localRuntimeDeps(payload, { executionRuntime: "local" }),
    );
  }

  async enqueue(
    payload: AgentTask,
    options: { opportunistic?: boolean } = {},
  ): Promise<RunResult> {
    const deps = await localRuntimeDeps(payload, { executionRuntime: "local" });
    const result = await enqueueAgentTask(payload, deps);
    if (result.status === "queued" && options.opportunistic !== false) {
      after(() =>
        executeQueuedAgentRun(result.runId, deps).catch((error: unknown) => {
          console.error("[AGENT_QUEUE_AFTER_FAILED]", {
            runId: result.runId,
            ...describeFailure(error),
          });
        }),
      );
    }
    return result;
  }

  async executeQueued(runId: string, payload: AgentTask): Promise<RunResult> {
    return executeQueuedAgentRun(
      runId,
      await localRuntimeDeps(payload, { executionRuntime: "local" }),
    );
  }
}

/** A Strands session message starts with the restored field, for example `field=<a.b> | …`. */
const SESSION_FIELD =
  /^field=<([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*){0,7})>/;

/**
 * Names only, as elsewhere. The Strands SDK does not export `SessionError`,
 * and any code can use that name, so only a field path that matches the SDK's
 * pattern is kept from its message; no free text reaches the log.
 */
function describeFailure(error: unknown) {
  if (!(error instanceof Error)) return { errorName: "UnknownError" };
  const field =
    error.name === "SessionError"
      ? SESSION_FIELD.exec(error.message)?.[1]
      : undefined;
  return {
    errorName: error.name,
    ...(error.cause instanceof Error ? { causeName: error.cause.name } : {}),
    ...(field ? { field } : {}),
  };
}
