export type ActivityToolLabelKey =
  | "captureInvitation"
  | "confirmVisit"
  | "createTemporaryHold"
  | "evaluateOverlap"
  | "findVisitOptions"
  | "notify"
  | "rescheduleVisit";

export type ActivityPolicyLabelKey = "allow" | "deny" | "interrupt";

const TOOL_LABELS: Record<string, ActivityToolLabelKey> = {
  capture_invitation: "captureInvitation",
  confirm_visit: "confirmVisit",
  create_temporary_hold: "createTemporaryHold",
  evaluate_overlap: "evaluateOverlap",
  find_visit_options: "findVisitOptions",
  notify: "notify",
  reschedule_visit: "rescheduleVisit",
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
