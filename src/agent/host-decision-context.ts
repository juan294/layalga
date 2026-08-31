import { stayApprovalHash } from "@/core/booking/holds";
import type { PolicyVerdict, VisitDraft } from "@/core/policy/evaluate-overlap";

export interface VerifiedHostDecisionContext {
  stay: readonly [string, string];
  adults: number;
  children: number;
  pets: number;
  specialRequests: readonly string[];
  roomIds?: readonly string[];
  overflowConsent?: boolean;
  overflowRooms?: readonly HostOverflowRoomDetail[];
  overflowArrangements?: readonly string[];
}

export interface HostOverflowRoomDetail {
  id: string;
  guestLabel: string;
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
    requestedDraft: requestedDraft(draft),
    stayApprovalHash: stayApprovalHash(draft),
  };
}

export function hostOverflowDecisionReason(
  draft: VisitDraft,
  rooms: readonly HostOverflowRoomDetail[],
  overflowArrangements: readonly string[],
) {
  return {
    decision: "interrupt",
    reason: "overflow",
    rooms: rooms.map(({ id, guestLabel }) => ({ id, guestLabel })),
    overflowArrangements: [...overflowArrangements],
    requestedDraft: requestedDraft(draft),
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
  const roomIds = draft?.roomIds;
  const overflowConsent = draft?.overflowConsent;
  const overflowRooms = reason?.rooms;
  const overflowArrangements = reason?.overflowArrangements;
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
    !specialRequests.every((request) => typeof request === "string") ||
    (roomIds !== undefined &&
      (!Array.isArray(roomIds) ||
        roomIds.length === 0 ||
        roomIds.length > 20 ||
        new Set(roomIds).size !== roomIds.length ||
        !roomIds.every(isUuid))) ||
    (overflowConsent !== undefined && typeof overflowConsent !== "boolean") ||
    (reason?.reason === "overflow" &&
      (!Array.isArray(overflowRooms) ||
        overflowRooms.length === 0 ||
        overflowRooms.length > 20 ||
        !overflowRooms.every(isOverflowRoom) ||
        !Array.isArray(overflowArrangements) ||
        overflowArrangements.length === 0 ||
        overflowArrangements.length > 20 ||
        !overflowArrangements.every(
          (arrangement) =>
            typeof arrangement === "string" &&
            arrangement.trim().length > 0 &&
            arrangement.length <= 240,
        ) ||
        !sameStrings(
          roomIds as string[] | undefined,
          overflowRooms.map((room) => room.id),
        )))
  ) {
    return null;
  }

  const context: VerifiedHostDecisionContext = {
    stay: [stay[0], stay[1]],
    adults: draft.adults,
    children: draft.children,
    pets: draft.pets,
    specialRequests,
    ...(roomIds ? { roomIds: roomIds as string[] } : {}),
    ...(typeof overflowConsent === "boolean" ? { overflowConsent } : {}),
    ...(reason.reason === "overflow"
      ? {
          overflowRooms: overflowRooms as HostOverflowRoomDetail[],
          overflowArrangements: overflowArrangements as string[],
        }
      : {}),
  };
  return stayApprovalHash(context) === reason.stayApprovalHash ? context : null;
}

function requestedDraft(draft: VisitDraft): VerifiedHostDecisionContext {
  return {
    stay: draft.stay.map(dateValue) as [string, string],
    adults: draft.adults,
    children: draft.children,
    pets: draft.pets,
    specialRequests: [...draft.specialRequests],
    ...(draft.roomIds ? { roomIds: [...draft.roomIds].sort() } : {}),
    ...(typeof draft.overflowConsent === "boolean"
      ? { overflowConsent: draft.overflowConsent }
      : {}),
  };
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

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isOverflowRoom(value: unknown): value is HostOverflowRoomDetail {
  const room = record(value);
  return (
    isUuid(room?.id) &&
    typeof room?.guestLabel === "string" &&
    room.guestLabel.trim().length > 0 &&
    room.guestLabel.length <= 120
  );
}

function sameStrings(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  if (!left) return false;
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
