import { BedrockAgentCoreApp } from "bedrock-agentcore/runtime";

import { runJob } from "@/core/reconfirmation/jobs";

import { executeQueuedAgentRun, runAgentTask } from "../run-task";
import { acceptAgentRunExecution } from "./async-execution";
import { runtimeDeps } from "./deps";
import { LocalAgentClient } from "./local";
import { isExecuteAgentRunRequest, parseAgentCoreRequest } from "./request";

const inFlightTasks = new Set<Promise<void>>();
const tickAgent = new LocalAgentClient();

export const agentCoreApp: BedrockAgentCoreApp = new BedrockAgentCoreApp({
  invocationHandler: {
    process: async (request): Promise<unknown> => {
      const task = parseAgentCoreRequest(request);
      if (isExecuteAgentRunRequest(task)) {
        return acceptAgentRunExecution(task, {
          addAsyncTask: (name) => agentCoreApp.addAsyncTask(name),
          completeAsyncTask: (taskId) => agentCoreApp.completeAsyncTask(taskId),
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
        return runAgentTask(task, await runtimeDeps(task));
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
    },
  },
});

function trackAgentCoreTask(execution: Promise<void>): void {
  inFlightTasks.add(execution);
  void execution.finally(() => inFlightTasks.delete(execution));
}

agentCoreApp.run();
