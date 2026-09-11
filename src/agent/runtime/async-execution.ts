import type { RunResult } from "../task";
import type { ExecuteAgentRunRequest } from "./request";

export interface AgentRunAccepted {
  status: "accepted";
  runId: string;
}

interface AsyncRunRuntime {
  addAsyncTask(name: string): number;
  completeAsyncTask(taskId: number): void;
  execute(request: ExecuteAgentRunRequest): Promise<RunResult>;
  track(execution: Promise<void>): void;
  reportFailure(runId: string, error: unknown): void;
}

/**
 * Register durable work with AgentCore and keep the invocation open until the
 * model finishes. AgentCore can stop the runtime after an invocation returns,
 * even when its application registry still contains an async task.
 */
export async function acceptAgentRunExecution(
  request: ExecuteAgentRunRequest,
  runtime: AsyncRunRuntime,
): Promise<AgentRunAccepted> {
  const taskId = runtime.addAsyncTask("agent-run");
  const execution = Promise.resolve()
    .then(() => runtime.execute(request))
    .then(() => undefined)
    .catch((error: unknown) => {
      runtime.reportFailure(request.runId, error);
    })
    .finally(() => runtime.completeAsyncTask(taskId));
  runtime.track(execution);
  await execution;
  return { status: "accepted", runId: request.runId };
}
