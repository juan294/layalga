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
import { PostgresStorage } from "./storage/postgres-storage";
import { systemPrompts } from "./system-prompt";

export interface BuildAgentOptions {
  sessionId: string;
  deps: AgentDeps;
  model?: Model<BaseModelConfig>;
}

export function buildAgent({ sessionId, deps, model }: BuildAgentOptions): Agent {
  const selectedModel = model ?? bedrockModel();
  const agent = new Agent({
    model: selectedModel,
    tools: buildTools(deps),
    sessionManager: new SessionManager({
      sessionId,
      storage: new PostgresStorage(sqlClient(deps.db), sessionId).namespace("session"),
      saveLatestOn: "message",
    }),
    systemPrompt: systemPrompts[deps.locale],
    printer: false,
    toolExecutor: "sequential",
  });
  installPolicyHook(agent, deps);
  return agent;
}

function bedrockModel(): BedrockModel {
  const config = parseServerEnvironment();
  if (config.model !== "bedrock") {
    throw new Error("A model must be provided when MODEL is scripted");
  }
  return new BedrockModel({
    region: config.awsRegion!,
    modelId: config.bedrockModelId!,
  });
}
