import {
  Agent,
  BedrockModel,
  SessionManager,
  type Model,
  type BaseModelConfig,
} from "@strands-agents/sdk";

import { sqlClient } from "@/core/db/client";
import { parseServerEnvironment } from "@/lib/server/env";

import { buildTools, type AgentDeps } from "./deps";
import { installPolicyHook } from "./policy-hook";
import { PromptMinimizingModel } from "./prompt-minimization";
import { PostgresStorage } from "./storage/postgres-storage";
import { systemPrompts } from "./system-prompt";
import type { AgentTask } from "./task";

export interface BuildAgentOptions {
  sessionId: string;
  deps: AgentDeps;
  task: AgentTask["task"];
  model?: Model<BaseModelConfig>;
}

export function buildAgent({
  sessionId,
  deps,
  task,
  model,
}: BuildAgentOptions): Agent {
  const selectedModel = model ?? bedrockModel();
  const agent = new Agent({
    model: selectedModel,
    tools: buildTools(deps, task),
    sessionManager: new SessionManager({
      sessionId,
      storage: new PostgresStorage(sqlClient(deps.db), sessionId).namespace(
        "session",
      ),
      saveLatestOn: "message",
    }),
    systemPrompt: systemPrompts[deps.locale],
    printer: false,
    toolExecutor: "sequential",
  });
  installPolicyHook(agent, deps);
  return agent;
}

function bedrockModel() {
  const config = parseServerEnvironment();
  if (config.model !== "bedrock") {
    throw new Error("A model must be provided when MODEL is scripted");
  }
  return new PromptMinimizingModel(
    new BedrockModel({
      region: config.awsRegion!,
      modelId: config.bedrockModelId!,
    }),
  );
}
