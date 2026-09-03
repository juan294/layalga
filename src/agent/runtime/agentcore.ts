import { BedrockAgentCoreApp } from "bedrock-agentcore/runtime";

import { handleAgentCoreRequest } from "./handler";

export const agentCoreApp: BedrockAgentCoreApp = new BedrockAgentCoreApp({
  invocationHandler: {
    process: (request, context) =>
      handleAgentCoreRequest(request, context.log, {
        addAsyncTask: (name) => agentCoreApp.addAsyncTask(name),
        completeAsyncTask: (taskId) => {
          agentCoreApp.completeAsyncTask(taskId);
        },
      }),
  },
});

agentCoreApp.run();
