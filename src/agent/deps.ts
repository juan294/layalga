import type { Tool } from "@strands-agents/sdk";

import { captureInvitationTool } from "./tools/capture-invitation";
import { confirmVisitTool } from "./tools/confirm-visit";
import { createTemporaryHoldTool } from "./tools/create-temporary-hold";
import { evaluateOverlapTool } from "./tools/evaluate-overlap";
import { findVisitOptionsTool } from "./tools/find-visit-options";
import { findRoomOptionsTool } from "./tools/find-room-options";
import { listGuestRoomsTool } from "./tools/list-guest-rooms";
import { notifyTool } from "./tools/notify";
import { prepareRoomActionTool } from "./tools/prepare-room-action";
import { rescheduleVisitTool } from "./tools/reschedule-visit";
import type { AgentDeps } from "./ports";
import type { AgentTask } from "./task";

export { NoopScheduler } from "./scheduler";
export type { Scheduler } from "./scheduler";
export type { AgentAuthority, AgentDeps, ExecutionRuntime } from "./ports";

export function buildTools(deps: AgentDeps, task: AgentTask["task"]): Tool[] {
  if (task === "host_room_request") {
    return [
      listGuestRoomsTool(deps),
      findRoomOptionsTool(deps),
      prepareRoomActionTool(deps),
    ];
  }
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
