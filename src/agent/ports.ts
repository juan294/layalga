import type { Clock } from "@/core/clock";
import type { DatabaseClient } from "@/core/db/client";

import type { Scheduler } from "./scheduler";

export interface AgentDeps {
  db: DatabaseClient;
  clock: Clock;
  scheduler: Scheduler;
  appUrl: string;
  locale: "en" | "es";
  authority?: AgentAuthority;
}

export interface AgentAuthority {
  homeId: string;
  hostId?: string;
  invitationId?: string;
  visitId?: string;
  jobId?: string;
}
