import type { Clock } from "@/core/clock";
import type { DatabaseClient } from "@/core/db/client";
import type { MemoryClient } from "@/core/memory/client";

import type { Scheduler } from "./scheduler";

export type ExecutionRuntime = "local" | "agentcore";

export interface AgentDeps {
  db: DatabaseClient;
  clock: Clock;
  scheduler: Scheduler;
  appUrl: string;
  locale: "en" | "es";
  authority?: AgentAuthority;
  /** Injectable recall client; production uses the existing AgentCore client. */
  memoryClient?: MemoryClient;
}

export interface AgentAuthority {
  homeId: string;
  hostId?: string;
  invitationId?: string;
  visitId?: string;
  jobId?: string;
  /**
   * The invited party this task is scoped to. Resolved for every
   * party-scoped guest task (`guest_submit`, `guest_change`,
   * `guest_reconfirm`, `tick`, and `resume` on an `inv_*` session) and, for
   * `host_capture` only, when a deterministic pre-match finds an existing
   * party of the home whose family name appears in the raw message (see
   * `src/agent/party-match.ts`). Drives which household-memory namespace a
   * task's `MemoryManager` stores read and write (`src/agent/memory.ts`);
   * unrelated to database authority checks, which keep using `homeId`.
   */
  partyId?: string;
  guestSubmission?: {
    stay: [string, string];
    adults: number;
    children: number;
    pets: number;
    specialRequests: string[];
    notes?: string;
    roomIds?: string[];
    overflowConsent?: boolean;
  };
}
