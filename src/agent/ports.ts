import type { CaptureInputError } from "@/core/booking/invitations";
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
  onCaptureFailure?: (error: CaptureInputError) => void;
  /** Injectable recall client; production uses the existing AgentCore client. */
  memoryClient?: MemoryClient;
}

export interface AgentAuthority {
  homeId: string;
  hostId?: string;
  invitationId?: string;
  visitId?: string;
  jobId?: string;
  /** Verified party for this guest task or explicitly selected returning capture. */
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
