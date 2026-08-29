import type { Tool } from "@strands-agents/sdk";

import type { Clock } from "@/core/clock";
import type { DatabaseClient } from "@/core/db/client";

import { captureInvitationTool } from "./tools/capture-invitation";
import { confirmVisitTool } from "./tools/confirm-visit";
import { createTemporaryHoldTool } from "./tools/create-temporary-hold";
import { evaluateOverlapTool } from "./tools/evaluate-overlap";
import { findVisitOptionsTool } from "./tools/find-visit-options";
import { notifyTool } from "./tools/notify";
import { rescheduleVisitTool } from "./tools/reschedule-visit";

export interface Scheduler {
  schedule?(name: string, at: Date, payload: unknown): Promise<string | void>;
  cancel?(externalRef: string): Promise<void>;
}

export class NoopScheduler implements Scheduler {}

export interface AgentDeps {
  db: DatabaseClient;
  clock: Clock;
  scheduler: Scheduler;
  appUrl: string;
  locale: "en" | "es";
}

export function buildTools(deps: AgentDeps): Tool[] {
  return [
    captureInvitationTool(deps),
    findVisitOptionsTool(deps),
    evaluateOverlapTool(deps),
    createTemporaryHoldTool(deps),
    confirmVisitTool(deps),
    rescheduleVisitTool(deps),
    notifyTool(deps),
  ];
}
