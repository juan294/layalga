import { BedrockAgentCoreApp } from "bedrock-agentcore/runtime";

import {
  runJob,
  type AgentInvoker,
  type TickTask,
} from "@/core/reconfirmation/jobs";

import { executeQueuedAgentRun, runAgentTask } from "../run-task";
import { acceptAgentRunExecution } from "./async-execution";
import { runtimeDeps } from "./deps";
import { isExecuteAgentRunRequest, parseAgentCoreRequest } from "./request";

const inFlightTasks = new Set<Promise<void>>();
const tickAgent: AgentInvoker = {
  async run(task: TickTask) {
    return runAgentTask(task, await runtimeDeps(task));
  },
};

export const agentCoreApp: BedrockAgentCoreApp = new BedrockAgentCoreApp({
  invocationHandler: {
    process: async (request, context): Promise<unknown> => {
      context.log.info(
        {
          databaseConfigured: Boolean(process.env.DATABASE_URL),
          modelConfigured: Boolean(process.env.BEDROCK_MODEL_ID),
        },
        "AgentCore invocation started",
      );
      try {
        const task = parseAgentCoreRequest(request);
        if (isExecuteAgentRunRequest(task)) {
          return acceptAgentRunExecution(task, {
            addAsyncTask: (name) => agentCoreApp.addAsyncTask(name),
            completeAsyncTask: (taskId) =>
              agentCoreApp.completeAsyncTask(taskId),
            execute: async ({ runId, task: queuedTask }) =>
              executeQueuedAgentRun(runId, await runtimeDeps(queuedTask)),
            track: trackAgentCoreTask,
            reportFailure: (runId, errorName) => {
              console.error("[AGENTCORE_QUEUE_EXECUTION_FAILED]", {
                runId,
                errorName,
              });
            },
          });
        }
        if (task.task !== "tick") {
          return await runAgentTask(task, await runtimeDeps(task));
        }

        const taskId = agentCoreApp.addAsyncTask("tick");
        const trackedTick = runtimeDeps(task)
          .then((deps) =>
            runJob(deps.db, deps.clock, tickAgent, task.jobId, deps.scheduler),
          )
          .then(() => undefined)
          .catch((error: unknown) => {
            console.error("[AGENTCORE_TICK_FAILED]", {
              jobId: task.jobId,
              errorName: error instanceof Error ? error.name : "UnknownError",
            });
          })
          .finally(() => {
            agentCoreApp.completeAsyncTask(taskId);
          });
        trackAgentCoreTask(trackedTick);
        return { status: "accepted", jobId: task.jobId };
      } catch (error) {
        const detail = {
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorCode: errorCode(error),
          errorMessage:
            error instanceof Error ? error.message : "Unknown failure",
        };
        context.log.error(detail, "AgentCore invocation failed");
        throw error;
      }
    },
  },
});

function trackAgentCoreTask(execution: Promise<void>): void {
  inFlightTasks.add(execution);
  void execution.finally(() => inFlightTasks.delete(execution));
}

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

agentCoreApp.run();
