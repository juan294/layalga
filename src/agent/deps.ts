import type { Tool } from "@strands-agents/sdk";

import { captureInvitationTool } from "./tools/capture-invitation";
import { confirmVisitTool } from "./tools/confirm-visit";
import { createTemporaryHoldTool } from "./tools/create-temporary-hold";
import { evaluateOverlapTool } from "./tools/evaluate-overlap";
import { findVisitOptionsTool } from "./tools/find-visit-options";
import { notifyTool } from "./tools/notify";
import { rescheduleVisitTool } from "./tools/reschedule-visit";
import type { AgentDeps } from "./ports";

export { NoopScheduler } from "./scheduler";
export type { Scheduler } from "./scheduler";
export type { AgentAuthority, AgentDeps } from "./ports";

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
