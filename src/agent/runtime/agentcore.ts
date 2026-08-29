import { BedrockAgentCoreApp } from "bedrock-agentcore/runtime";

import { runAgentTask } from "../run-task";
import { agentTaskSchema } from "../task";
import { runtimeDeps } from "./deps";

export const agentCoreApp = new BedrockAgentCoreApp({
  invocationHandler: {
    // bedrock-agentcore 0.4.3 carries zod 4.4 types while the app uses 4.5.
    // The runtime value is compatible; parse again to keep this boundary explicit.
    requestSchema: agentTaskSchema as never,
    process: async (request) => {
      const task = agentTaskSchema.parse(request);
      if (task.task !== "tick") {
        return runAgentTask(task, await runtimeDeps(task));
      }

      const taskId = agentCoreApp.addAsyncTask("tick", { jobId: task.jobId });
      void runtimeDeps(task)
        .then((deps) => runAgentTask(task, deps))
        .catch((error: unknown) => {
          console.error("AgentCore tick failed", error);
        })
        .finally(() => agentCoreApp.completeAsyncTask(taskId));
      return { acknowledged: true, jobId: task.jobId };
    },
  },
});

agentCoreApp.run();
