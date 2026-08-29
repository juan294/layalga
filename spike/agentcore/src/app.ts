import type { InterruptResponseContentData } from '@strands-agents/sdk';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';

import { buildAgent, countHolds } from './agent.js';
import { TaskSchema } from './contracts.js';
import { createDatabase } from './database.js';

const sql = createDatabase();

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    process: async (request) => {
      try {
        const task = TaskSchema.parse(request);
        const agent = buildAgent(task.sessionId, sql);
        const result =
          task.task === 'start'
            ? await agent.invoke(task.prompt)
            : await agent.invoke(
                task.responses.map(
                  (response): InterruptResponseContentData => ({ interruptResponse: response }),
                ),
              );

        return {
          stopReason: result.stopReason,
          interrupts: (result.interrupts ?? []).map((interrupt) => interrupt.toJSON()),
          holdsAfter: await countHolds(sql),
        };
      } catch (error) {
        console.error('AgentCore invocation failed', error);
        throw error;
      }
    },
  },
});

app.run();
