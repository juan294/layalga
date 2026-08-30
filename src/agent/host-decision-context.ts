import { stayApprovalHash } from "@/core/booking/holds";
import type { PolicyVerdict, VisitDraft } from "@/core/policy/evaluate-overlap";

export interface VerifiedHostDecisionContext {
  stay: readonly [string, string];
  adults: number;
  children: number;
  pets: number;
  specialRequests: readonly string[];
}

export function hostDecisionReason(
  draft: VisitDraft,
  verdict: Extract<PolicyVerdict, { decision: "interrupt" }>,
) {
  return {
    decision: verdict.decision,
    reason: verdict.reason,
    allocation: verdict.allocation,
    specialRequests: [...verdict.specialRequests],
    requestedDraft: {
      stay: draft.stay.map(dateValue) as [string, string],
      adults: draft.adults,
      children: draft.children,
      pets: draft.pets,
      specialRequests: [...draft.specialRequests],
    },
    stayApprovalHash: stayApprovalHash(draft),
  };
}

export function verifiedHostDecisionContext(
  value: unknown,
): VerifiedHostDecisionContext | null {
  const reason = record(value);
  const draft = record(reason?.requestedDraft);
  const stay = draft?.stay;
  const specialRequests = draft?.specialRequests;
  if (
    typeof reason?.stayApprovalHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(reason.stayApprovalHash) ||
    !Array.isArray(stay) ||
    stay.length !== 2 ||
    !isIsoDate(stay[0]) ||
    !isIsoDate(stay[1]) ||
    stay[0] >= stay[1] ||
    !isCount(draft?.adults) ||
    !isCount(draft?.children) ||
    !isCount(draft?.pets) ||
    !Array.isArray(specialRequests) ||
    !specialRequests.every((request) => typeof request === "string")
  ) {
    return null;
  }

  const context: VerifiedHostDecisionContext = {
    stay: [stay[0], stay[1]],
    adults: draft.adults,
    children: draft.children,
    pets: draft.pets,
    specialRequests,
  };
  return stayApprovalHash(context) === reason.stayApprovalHash ? context : null;
}

function dateValue(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
