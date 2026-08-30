import { BedrockAgentCoreApp } from "bedrock-agentcore/runtime";

import { runJob } from "@/core/reconfirmation/jobs";

import { runAgentTask } from "../run-task";
import { runtimeDeps } from "./deps";
import { LocalAgentClient } from "./local";
import { parseAgentCoreRequest } from "./request";

const inFlightTicks = new Set<Promise<void>>();
const tickAgent = new LocalAgentClient();

export const agentCoreApp = new BedrockAgentCoreApp({
  invocationHandler: {
    process: async (request) => {
      const task = parseAgentCoreRequest(request);
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
          console.error("AgentCore tick failed", error);
        })
        .finally(() => {
          agentCoreApp.completeAsyncTask(taskId);
          inFlightTicks.delete(trackedTick);
        });
      inFlightTicks.add(trackedTick);
      return { status: "accepted", jobId: task.jobId };
    },
  },
});

agentCoreApp.run();
