import { DbDemoClock } from "@/core/clock";
import { getDatabaseConnection, sqlClient } from "@/core/db/client";

import type { RunAgentDeps } from "../run-task";
import { schedulerForHome } from "../scheduler";
import { scriptedModelForTask } from "../scripted-model-selection";
import type { AgentTask } from "../task";

export async function runtimeDeps(task: AgentTask): Promise<RunAgentDeps> {
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
    appUrl: process.env.APP_URL ?? "http://localhost:3008",
    locale: "locale" in task ? task.locale : "en",
  };
  if (process.env.MODEL === "scripted") {
    deps.model = scriptedModelForTask(task, deps);
  }
  return deps;
}
