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
  reportFailure(runId: string, errorName: string): void;
}

/**
 * Register durable work with AgentCore and acknowledge it without waiting for
 * the model. The worker claims the existing database run before execution.
 */
export function acceptAgentRunExecution(
  request: ExecuteAgentRunRequest,
  runtime: AsyncRunRuntime,
): AgentRunAccepted {
  const taskId = runtime.addAsyncTask("agent-run");
  const execution = Promise.resolve()
    .then(() => runtime.execute(request))
    .then(() => undefined)
    .catch((error: unknown) => {
      runtime.reportFailure(
        request.runId,
        error instanceof Error ? error.name : "UnknownError",
      );
    })
    .finally(() => runtime.completeAsyncTask(taskId));
  runtime.track(execution);
  return { status: "accepted", runId: request.runId };
}
