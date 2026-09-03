import {
  runJob,
  type AgentInvoker,
  type TickTask,
} from "@/core/reconfirmation/jobs";

import { executeQueuedAgentRun, runAgentTask } from "../run-task";
import { acceptAgentRunExecution } from "./async-execution";
import { runtimeDeps } from "./deps";
import { parseAgentCoreRequest } from "./request";

/**
 * Minimal logger contract the handler needs. A Fastify/pino request logger
 * (what BedrockAgentCoreApp hands the process function as `context.log`)
 * satisfies this structurally.
 */
export interface AgentCoreLog {
  info(mergingObject: Record<string, unknown>, message: string): void;
  error(mergingObject: Record<string, unknown>, message: string): void;
}

/** Async-task bookkeeping the handler needs from its host BedrockAgentCoreApp. */
export interface AsyncTaskRegistry {
  addAsyncTask(name: string): number;
  completeAsyncTask(taskId: number): void;
}

const inFlightTasks = new Set<Promise<void>>();

const tickAgent: AgentInvoker = {
  async run(task: TickTask) {
    return runAgentTask(
      task,
      await runtimeDeps(task, { executionRuntime: "agentcore" }),
    );
  },
};

/**
 * Handles one AgentCore invocation request. Split out from the
 * BedrockAgentCoreApp wiring in ./agentcore so it can be exercised directly
 * in tests without booting the HTTP runtime or depending on the app
 * instance's own async-task registry.
 */
export async function handleAgentCoreRequest(
  request: unknown,
  log: AgentCoreLog,
  registry: AsyncTaskRegistry,
): Promise<unknown> {
  log.info(
    {
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      modelConfigured: Boolean(process.env.BEDROCK_MODEL_ID),
    },
    "AgentCore invocation started",
  );
  try {
    const parsed = parseAgentCoreRequest(request);
    if ("operation" in parsed) {
      switch (parsed.operation) {
        case "execute_run":
          return acceptAgentRunExecution(parsed, {
            addAsyncTask: (name) => registry.addAsyncTask(name),
            completeAsyncTask: (taskId) => registry.completeAsyncTask(taskId),
            execute: async ({ runId, task: queuedTask }) =>
              executeQueuedAgentRun(
                runId,
                await runtimeDeps(queuedTask, {
                  executionRuntime: "agentcore",
                }),
              ),
            track: trackAgentCoreTask,
            reportFailure: (runId, error) => {
              console.error("[AGENTCORE_QUEUE_EXECUTION_FAILED]", {
                runId,
                ...describeError(error),
              });
            },
          });
        case "scheduled_tick": {
          const tickTask: TickTask = {
            task: "tick",
            homeId: parsed.homeId,
            jobId: parsed.jobId,
          };
          const taskId = registry.addAsyncTask("tick");
          const trackedTick = runtimeDeps(tickTask, {
            executionRuntime: "agentcore",
          })
            .then((deps) =>
              runJob(
                deps.db,
                deps.clock,
                tickAgent,
                tickTask.jobId,
                deps.scheduler,
              ),
            )
            .then(() => undefined)
            .catch((error: unknown) => {
              console.error("[AGENTCORE_TICK_FAILED]", {
                jobId: tickTask.jobId,
                ...describeError(error),
              });
            })
            .finally(() => {
              registry.completeAsyncTask(taskId);
            });
          trackAgentCoreTask(trackedTick);
          return { status: "accepted", jobId: tickTask.jobId };
        }
        default:
          return assertNever(parsed);
      }
    }

    // Every bare AgentTask -- tick included -- executes and is awaited here,
    // exactly like tickAgent.run above. A bare tick must NOT re-claim through
    // runJob: production callers (runDueJobs -> executeClaimedJob) already
    // claim the job before invoking AgentCore, so a second claim attempt here
    // would find the job already running, skip execution as "already
    // claimed", and never run the agent -- leaving the caller's delivery
    // check to fail.
    return await runAgentTask(
      parsed,
      await runtimeDeps(parsed, { executionRuntime: "agentcore" }),
    );
  } catch (error) {
    log.error(describeError(error), "AgentCore invocation failed");
    throw error;
  }
}

type ErrorDetail = {
  errorName: string;
  errorCode?: string;
  errorMessage: string;
  issues?: { code: string; path: string; message: string }[];
};

/**
 * Describe a thrown value for logs. Zod errors built with `new ZodError` are
 * not `Error` instances, so read `name`, `message`, and `issues` from any
 * object; never include issue inputs, which may carry values.
 */
function describeError(error: unknown): ErrorDetail {
  const record =
    error !== null && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const issues = Array.isArray(record.issues)
    ? record.issues
        .filter((issue) => issue !== null && typeof issue === "object")
        .map((issue) => {
          const entry = issue as Record<string, unknown>;
          return {
            code: String(entry.code ?? "unknown"),
            path: Array.isArray(entry.path) ? entry.path.join(".") : "",
            message: String(entry.message ?? ""),
          };
        })
    : undefined;
  const detail: ErrorDetail = {
    errorName: typeof record.name === "string" ? record.name : "UnknownError",
    errorCode: errorCode(error),
    errorMessage: issues
      ? issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
      : typeof record.message === "string"
        ? record.message
        : "Unknown failure",
  };
  if (issues) detail.issues = issues;
  return detail;
}

function trackAgentCoreTask(execution: Promise<void>): void {
  inFlightTasks.add(execution);
  void execution.finally(() => inFlightTasks.delete(execution));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled AgentCore envelope: ${JSON.stringify(value)}`);
}

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}
