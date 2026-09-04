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
import { installMemorySearchAudit, memoryConfigForTask } from "./memory";
import { installPolicyHook } from "./policy-hook";
import { PromptMinimizingModel } from "./prompt-minimization";
import { PostgresStorage } from "./storage/postgres-storage";
import { RESUME_SYSTEM_PROMPT_SUFFIX, systemPrompts } from "./system-prompt";
import type { AgentTask } from "./task";

export interface BuildAgentOptions {
  sessionId: string;
  deps: AgentDeps;
  task: AgentTask["task"];
  homeId: string;
  model?: Model<BaseModelConfig>;
}

export function buildAgent({
  sessionId,
  deps,
  task,
  homeId,
  model,
}: BuildAgentOptions): Agent {
  const selectedModel = model ?? bedrockModel();
  const memoryManager = memoryConfigForTask(task, deps.authority, sessionId);
  // A resumed run has no user-turn text prompt of its own to carry the
  // language/no-notify steer other tasks get from `buildPrompt`
  // (`src/agent/run-task.ts`), so it rides the system prompt instead.
  const systemPrompt =
    task === "resume"
      ? `${systemPrompts[deps.locale]}${RESUME_SYSTEM_PROMPT_SUFFIX[deps.locale]}`
      : systemPrompts[deps.locale];
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
    systemPrompt,
    printer: false,
    toolExecutor: "sequential",
    // Ids only, never guest or host names: prompt minimization strips
    // names before any model call, and spans must hold to the same bound.
    traceAttributes: {
      "layalga.home_id": homeId,
      "layalga.task": task,
      "session.id": sessionId,
    },
    // `undefined` when MEMORY=none or no store applies to this task, so
    // agent construction stays byte-identical to before Phase 3 in that
    // case (see `memoryConfigForTask`).
    ...(memoryManager ? { memoryManager } : {}),
  });
  installPolicyHook(agent, deps);
  if (memoryManager) installMemorySearchAudit(agent, deps);
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
