import { SystemClock } from "@/core/clock";
import { getDatabaseConnection, sqlClient } from "@/core/db/client";
import { parseServerEnvironment } from "@/lib/server/env";

import type { ExecutionRuntime } from "../ports";
import type { RunAgentDeps } from "../run-task";
import { configuredScheduler } from "../scheduler";
import type { AgentTask } from "../task";

/**
 * Production dependencies for one agent task. The model is left unset, so
 * runs use Bedrock; the scripted test model is attached only by
 * `localRuntimeDeps`, which the AgentCore bundle never imports.
 */
export async function runtimeDeps(
  task: AgentTask,
  options?: { executionRuntime?: ExecutionRuntime },
): Promise<RunAgentDeps> {
  const config = parseServerEnvironment();
  const connection = getDatabaseConnection();
  const [home] = await sqlClient(connection.db)<{ id: string }[]>`
    select id from public.homes where id = ${task.homeId}
  `;
  if (!home) throw new Error(`Home not found: ${task.homeId}`);
  return {
    db: connection.db,
    clock: new SystemClock(),
    scheduler: configuredScheduler(),
    appUrl: config.appUrl,
    locale: "locale" in task && task.locale ? task.locale : "en",
    executionRuntime: options?.executionRuntime ?? "local",
  };
}
