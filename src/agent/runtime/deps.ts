import { DbDemoClock } from "@/core/clock";
import { getDatabaseConnection, sqlClient } from "@/core/db/client";
import { parseServerEnvironment } from "@/lib/server/env";

import type { ExecutionRuntime } from "../ports";
import type { RunAgentDeps } from "../run-task";
import { schedulerForHome } from "../scheduler";
import { scriptedModelForTask } from "../scripted-model-selection";
import type { AgentTask } from "../task";

export async function runtimeDeps(
  task: AgentTask,
  options?: { executionRuntime?: ExecutionRuntime },
): Promise<RunAgentDeps> {
  const config = parseServerEnvironment();
  const connection = getDatabaseConnection();
  const sql = sqlClient(connection.db);
  const [home] = await sql<{ demo: boolean }[]>`
    select demo from public.homes where id = ${task.homeId}
  `;
  if (!home) throw new Error(`Home not found: ${task.homeId}`);
  const deps: RunAgentDeps = {
    db: connection.db,
    clock: await DbDemoClock.load(task.homeId, connection.db),
    scheduler: schedulerForHome({ homeDemo: home.demo }),
    appUrl: config.appUrl,
    locale: "locale" in task && task.locale ? task.locale : "en",
    executionRuntime: options?.executionRuntime ?? "local",
  };
  if (config.model === "scripted") {
    deps.model = scriptedModelForTask(task, deps);
  }
  return deps;
}
