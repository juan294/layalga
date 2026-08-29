import { DbDemoClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";

import { NoopScheduler, type AgentDeps } from "../deps";
import type { AgentTask } from "../task";

export async function runtimeDeps(task: AgentTask): Promise<AgentDeps> {
  const connection = getDatabaseConnection();
  return {
    db: connection.db,
    clock: await DbDemoClock.load(task.homeId, connection.db),
    scheduler: new NoopScheduler(),
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    locale: "locale" in task ? task.locale : "en",
  };
}
