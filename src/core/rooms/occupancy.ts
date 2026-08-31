import type { GuestRoomOption, RoomSelectionVerdict } from "./types";

const DENIED = (reason: "selection" | "capacity" | "overflow") =>
  ({
    decision: "deny",
    reason,
    rooms: [],
    usesOverflow: false,
    overflowArrangements: [],
  }) as const;

export function evaluateRoomSelection(
  roomIds: readonly string[],
  availableOptions: readonly GuestRoomOption[],
  partySize: number,
  overflowConsent: boolean,
): RoomSelectionVerdict {
  if (
    roomIds.length === 0 ||
    new Set(roomIds).size !== roomIds.length ||
    !Number.isInteger(partySize) ||
    partySize <= 0
  ) {
    return DENIED("selection");
  }

  const byId = new Map(availableOptions.map((room) => [room.id, room]));
  const selected = roomIds.map((id) => byId.get(id));
  if (selected.some((room) => room === undefined)) return DENIED("selection");

  const rooms = selected as GuestRoomOption[];
  const standardCapacity = rooms.reduce(
    (total, room) => total + room.standardCapacity,
    0,
  );
  if (standardCapacity >= partySize) {
    return {
      decision: "allow",
      reason: undefined,
      rooms,
      usesOverflow: false,
      overflowArrangements: [],
    };
  }

  const maximumCapacity = rooms.reduce(
    (total, room) => total + room.maximumCapacity,
    0,
  );
  if (maximumCapacity < partySize) return DENIED("capacity");
  if (!overflowConsent) return DENIED("overflow");

  let extraPeople = partySize - standardCapacity;
  const overflowArrangements: string[] = [];
  for (const room of [...rooms].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.id.localeCompare(right.id),
  )) {
    const extraCapacity = room.maximumCapacity - room.standardCapacity;
    if (extraPeople <= 0 || extraCapacity <= 0) continue;
    if (room.overflowArrangement) {
      overflowArrangements.push(room.overflowArrangement);
    }
    extraPeople -= extraCapacity;
  }
  if (
    overflowArrangements.length === 0 ||
    rooms.some(
      (room) =>
        room.maximumCapacity > room.standardCapacity &&
        room.overflowPolicy !== "host_approval",
    )
  ) {
    return DENIED("overflow");
  }

  return {
    decision: "interrupt",
    reason: "overflow",
    rooms,
    usesOverflow: true,
    overflowArrangements,
  };
}
