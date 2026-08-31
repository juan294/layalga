import { allocateRooms, type RoomCapacity } from "./allocate-rooms";

export type Stay = readonly [start: string | Date, end: string | Date];

export type VisitStatus =
  | "hold"
  | "confirmed"
  | "reconfirm_pending"
  | "reconfirmed"
  | "escalated"
  | "cancelled";

export interface VisitDraft {
  visitId?: string;
  stay: Stay;
  adults: number;
  children: number;
  pets: number;
  specialRequests: readonly string[];
  roomIds?: readonly string[];
  overflowConsent?: boolean;
}

export interface ExistingVisit {
  id: string;
  stay: Stay;
  adults: number;
  children: number;
  pets: number;
  status: VisitStatus;
  roomIds: readonly string[];
}

export interface HouseState {
  home: {
    petsTogetherAllowed: boolean;
    maxFamiliesWithChildren: number;
  };
  rooms: readonly RoomCapacity[];
  visits: readonly ExistingVisit[];
}

export type PolicyReason = "beds" | "children" | "pets" | "special_request";

export type PolicyVerdict =
  | {
      decision: "allow";
      reason: undefined;
      allocation: RoomCapacity[];
    }
  | {
      decision: "deny";
      reason: Exclude<PolicyReason, "special_request">;
      allocation: RoomCapacity[];
    }
  | {
      decision: "interrupt";
      reason: "special_request";
      allocation: RoomCapacity[];
      specialRequests: readonly string[];
    };

const ACTIVE_STATUSES = new Set<VisitStatus>([
  "hold",
  "confirmed",
  "reconfirm_pending",
  "reconfirmed",
  "escalated",
]);

function instant(value: string | Date): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time))
    throw new RangeError(`Invalid stay boundary: ${String(value)}`);
  return time;
}

function overlaps(left: Stay, right: Stay): boolean {
  return (
    instant(left[0]) < instant(right[1]) && instant(right[0]) < instant(left[1])
  );
}

export function evaluateOverlap(
  draft: VisitDraft,
  state: HouseState,
): PolicyVerdict {
  const overlapping = state.visits.filter(
    (visit) =>
      ACTIVE_STATUSES.has(visit.status) &&
      visit.id !== draft.visitId &&
      overlaps(draft.stay, visit.stay),
  );

  const occupiedRoomIds = new Set(
    overlapping.flatMap((visit) => visit.roomIds),
  );
  const freeRooms = state.rooms.filter((room) => !occupiedRoomIds.has(room.id));
  const allocation = allocateRooms(freeRooms, draft.adults + draft.children);

  if (allocation === null) {
    return { decision: "deny", reason: "beds", allocation: [] };
  }

  const familiesWithChildren = overlapping.filter(
    (visit) => visit.children > 0,
  ).length;
  if (
    draft.children > 0 &&
    familiesWithChildren >= state.home.maxFamiliesWithChildren
  ) {
    return { decision: "deny", reason: "children", allocation };
  }

  if (
    draft.pets > 0 &&
    overlapping.some((visit) => visit.pets > 0) &&
    !state.home.petsTogetherAllowed
  ) {
    return { decision: "deny", reason: "pets", allocation };
  }

  if (draft.specialRequests.length > 0) {
    return {
      decision: "interrupt",
      reason: "special_request",
      allocation,
      specialRequests: draft.specialRequests,
    };
  }

  return { decision: "allow", reason: undefined, allocation };
}
