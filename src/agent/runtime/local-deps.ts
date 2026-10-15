import { parseServerEnvironment } from "@/lib/server/env";

import type { ExecutionRuntime } from "../ports";
import type { RunAgentDeps } from "../run-task";
import { scriptedModelForTask } from "../scripted-model-selection";
import type { AgentTask } from "../task";
import { runtimeDeps } from "./deps";

/**
 * Dependencies for runs executed by the web process (`AGENT_RUNTIME=local`).
 * `MODEL=scripted` is test-only and the environment parser refuses it in
 * production, so this is the only place the scripted model is wired in.
 */
export async function localRuntimeDeps(
  task: AgentTask,
  options?: { executionRuntime?: ExecutionRuntime },
): Promise<RunAgentDeps> {
  const deps = await runtimeDeps(task, options);
  if (parseServerEnvironment().model === "scripted") {
    deps.model = scriptedModelForTask(task, deps);
  }
  return deps;
}
