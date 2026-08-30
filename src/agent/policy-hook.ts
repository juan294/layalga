import { BeforeToolCallEvent, type Agent } from "@strands-agents/sdk";
import type { JSONValue } from "@strands-agents/sdk";

import { stayApprovalHash } from "@/core/booking/holds";
import {
  evaluateOverlap,
  type PolicyVerdict,
  type VisitDraft,
} from "@/core/policy/evaluate-overlap";

import type { AgentDeps } from "./deps";
import { hostDecisionReason } from "./host-decision-context";
import type { HostDecision } from "./task";
import { audit, loadDraftForTool, loadHouseState } from "./tools/shared";

const GATED = new Set([
  "create_temporary_hold",
  "confirm_visit",
  "reschedule_visit",
]);

export function approvalCovers(
  draft: VisitDraft,
  approvalStayHash: string | null,
): boolean {
  return (
    approvalStayHash !== null && approvalStayHash === stayApprovalHash(draft)
  );
}

export function installPolicyHook(agent: Agent, deps: AgentDeps): void {
  agent.addHook(BeforeToolCallEvent, async (event) => {
    if (!GATED.has(event.toolUse.name)) return;
    const input = asObject(event.toolUse.input);
    const { homeId, draft, approvalStayHash, sanitizedInput } =
      await loadDraftForTool(deps, event.toolUse.name, input);
    event.toolUse.input = sanitizedInput as unknown as JSONValue;
    const verdict = evaluateOverlap(
      draft,
      await loadHouseState(deps, homeId, draft),
    );
    await audit(deps, homeId, event, "policy_verdict", {
      tool: event.toolUse.name,
      decision: verdict.decision,
      reason: verdict.reason ?? null,
    });

    if (verdict.decision === "deny") {
      event.cancel = denyMessage(verdict);
      return;
    }
    if (verdict.decision !== "interrupt") return;
    if (draft.visitId && approvalCovers(draft, approvalStayHash)) return;

    const response = event.interrupt<HostDecision>({
      name: "host_decision",
      reason: hostDecisionReason(draft, verdict) as unknown as JSONValue,
    });
    if (!response.approved) {
      event.cancel = `Declined by host${response.note ? `: ${response.note}` : ""}`;
      return;
    }
    const refreshedVerdict = evaluateOverlap(
      draft,
      await loadHouseState(deps, homeId, draft),
    );
    if (refreshedVerdict.decision === "deny") {
      event.cancel = denyMessage(refreshedVerdict);
      return;
    }
    event.toolUse.input = { ...sanitizedInput, approvedBy: response.hostId };
  });
}

function asObject(value: JSONValue): Record<string, JSONValue> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError("A gated tool input must be an object");
  }
  return value as Record<string, JSONValue>;
}

function denyMessage(
  verdict: Extract<PolicyVerdict, { decision: "deny" }>,
): string {
  if (verdict.reason === "children") {
    return "Cannot change the visit because another family with children overlaps these dates.";
  }
  if (verdict.reason === "pets") {
    return "Cannot change the visit because another party with a pet overlaps these dates.";
  }
  return "Cannot change the visit because there are not enough free beds for these dates.";
}
