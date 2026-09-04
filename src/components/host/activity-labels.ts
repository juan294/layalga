export type ActivityToolLabelKey =
  | "captureInvitation"
  | "confirmVisit"
  | "createTemporaryHold"
  | "evaluateOverlap"
  | "findVisitOptions"
  | "notify"
  | "rescheduleVisit"
  | "prepareRoomAction"
  | "listGuestRooms"
  | "findRoomOptions";

export type ActivityPolicyLabelKey = "allow" | "deny" | "interrupt";

export type ActivityKindLabelKey =
  | "toolCall"
  | "policyVerdict"
  | "decisionApplied"
  | "reconfirmChase"
  | "reconfirmEscalation";

const TOOL_LABELS: Record<string, ActivityToolLabelKey> = {
  capture_invitation: "captureInvitation",
  confirm_visit: "confirmVisit",
  create_temporary_hold: "createTemporaryHold",
  evaluate_overlap: "evaluateOverlap",
  find_visit_options: "findVisitOptions",
  notify: "notify",
  reschedule_visit: "rescheduleVisit",
  prepare_room_action: "prepareRoomAction",
  list_guest_rooms: "listGuestRooms",
  find_room_options: "findRoomOptions",
};

const KIND_LABELS: Record<string, ActivityKindLabelKey> = {
  tool_call: "toolCall",
  policy_verdict: "policyVerdict",
  decision_applied: "decisionApplied",
  reconfirm_chase: "reconfirmChase",
  reconfirm_escalation: "reconfirmEscalation",
};

export function activityToolLabelKey(
  value: string,
): ActivityToolLabelKey | null {
  return TOOL_LABELS[value] ?? null;
}

export function activityPolicyLabelKey(
  value: string,
): ActivityPolicyLabelKey | null {
  return value === "allow" || value === "deny" || value === "interrupt"
    ? value
    : null;
}

export function activityKindLabelKey(
  value: string,
): ActivityKindLabelKey | null {
  return KIND_LABELS[value] ?? null;
}
