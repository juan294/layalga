import { BeforeToolCallEvent, type Agent } from "@strands-agents/sdk";
import type { JSONValue } from "@strands-agents/sdk";

import { sqlClient } from "@/core/db/client";

import { stayApprovalHash } from "@/core/booking/holds";
import {
  evaluateOverlap,
  type PolicyVerdict,
  type VisitDraft,
} from "@/core/policy/evaluate-overlap";
import { listGuestRoomOptions } from "@/core/rooms/availability";
import { evaluateRoomSelection } from "@/core/rooms/occupancy";
import type { RoomSelectionVerdict } from "@/core/rooms/types";

import type { AgentDeps } from "./deps";
import {
  hostDecisionReason,
  hostOverflowDecisionReason,
} from "./host-decision-context";
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
    if (deps.authority?.invitationId) {
      const sql = sqlClient(deps.db);
      const [active] =
        await sql`select id from public.invitations where id = ${deps.authority.invitationId} and home_id = ${deps.authority.homeId} and status <> 'cancelled'`;
      if (!active) {
        event.cancel =
          "The invitation was withdrawn. No further actions are allowed.";
        return;
      }
    }
    if (!GATED.has(event.toolUse.name)) return;
    const input = asObject(event.toolUse.input);
    const { homeId, draft, approvalStayHash, sanitizedInput } =
      await loadDraftForTool(deps, event.toolUse.name, input);
    event.toolUse.input = sanitizedInput as unknown as JSONValue;
    const selection = await evaluateTrustedSelection(deps, homeId, draft);
    const verdict = evaluateOverlap(
      draft,
      await loadHouseState(deps, homeId, draft),
    );
    if (!draft.roomIds && verdict.allocation.length > 0) {
      draft.roomIds = verdict.allocation.map(({ id }) => id);
      sanitizedInput.roomIds = [...draft.roomIds];
    }
    const decision =
      selection?.decision === "deny" || verdict.decision === "deny"
        ? "deny"
        : selection?.decision === "interrupt" ||
            verdict.decision === "interrupt"
          ? "interrupt"
          : "allow";
    const reason =
      selection?.decision === "deny" || selection?.decision === "interrupt"
        ? selection.reason
        : verdict.reason;
    await audit(deps, homeId, event, "policy_verdict", {
      tool: event.toolUse.name,
      decision,
      reason: reason ?? null,
    });

    if (selection?.decision === "deny") {
      event.cancel = roomSelectionDenyMessage(selection);
      return;
    }
    if (verdict.decision === "deny") {
      event.cancel = denyMessage(verdict);
      return;
    }
    const overflowInterrupt = selection?.decision === "interrupt";
    if (!overflowInterrupt && verdict.decision !== "interrupt") return;
    if (draft.visitId && approvalCovers(draft, approvalStayHash)) return;

    const response = event.interrupt<HostDecision>({
      name: "host_decision",
      reason: (overflowInterrupt
        ? hostOverflowDecisionReason(
            draft,
            selection.rooms,
            selection.overflowArrangements,
          )
        : hostDecisionReason(
            draft,
            verdict as Extract<PolicyVerdict, { decision: "interrupt" }>,
          )) as unknown as JSONValue,
    });
    if (!response.approved) {
      event.cancel = `Declined by host${response.note ? `: ${response.note}` : ""}`;
      return;
    }
    const refreshedVerdict = evaluateOverlap(
      draft,
      await loadHouseState(deps, homeId, draft),
    );
    const refreshedSelection = await evaluateTrustedSelection(
      deps,
      homeId,
      draft,
    );
    if (refreshedSelection?.decision === "deny") {
      event.cancel = roomSelectionDenyMessage(refreshedSelection);
      return;
    }
    if (
      overflowInterrupt &&
      refreshedSelection?.decision === "interrupt" &&
      overflowReviewFingerprint(refreshedSelection) !==
        overflowReviewFingerprint(selection)
    ) {
      event.cancel =
        "The overflow sleeping arrangement changed while approval was pending. Review the updated room choice.";
      return;
    }
    if (refreshedVerdict.decision === "deny") {
      event.cancel = denyMessage(refreshedVerdict);
      return;
    }
    event.toolUse.input = { ...sanitizedInput, approvedBy: response.hostId };
  });
}

function overflowReviewFingerprint(
  selection: Extract<RoomSelectionVerdict, { decision: "interrupt" }>,
): string {
  return JSON.stringify({
    rooms: selection.rooms.map(({ id, guestLabel }) => ({ id, guestLabel })),
    overflowArrangements: selection.overflowArrangements,
  });
}

async function evaluateTrustedSelection(
  deps: AgentDeps,
  homeId: string,
  draft: VisitDraft,
): Promise<RoomSelectionVerdict | null> {
  if (!draft.roomIds) return null;
  const stay = draft.stay.map((value) =>
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value.slice(0, 10),
  ) as [string, string];
  const options = await listGuestRoomOptions(
    deps.db,
    homeId,
    stay,
    draft.adults + draft.children,
    { excludeVisitId: draft.visitId },
  );
  return evaluateRoomSelection(
    draft.roomIds,
    options,
    draft.adults + draft.children,
    draft.overflowConsent ?? false,
  );
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

function roomSelectionDenyMessage(
  verdict: Extract<RoomSelectionVerdict, { decision: "deny" }>,
): string {
  if (verdict.reason === "overflow") {
    return "The selected rooms need overflow sleeping space, but the guest did not consent to that arrangement.";
  }
  if (verdict.reason === "capacity") {
    return "The selected rooms cannot fit the party.";
  }
  return "One or more selected rooms are no longer available.";
}
