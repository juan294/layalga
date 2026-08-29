import {
  Agent,
  BedrockModel,
  SessionManager,
  type Model,
  type BaseModelConfig,
} from "@strands-agents/sdk";

import { sqlClient } from "@/core/db/client";

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
  const selectedModel =
    model ??
    new BedrockModel({
      region: process.env.AWS_REGION ?? "us-east-1",
      modelId:
        process.env.BEDROCK_MODEL_ID ??
        "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    });
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
