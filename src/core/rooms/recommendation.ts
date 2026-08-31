import type { GuestRoomOption } from "./types";

function byDisplayOrder(left: GuestRoomOption, right: GuestRoomOption): number {
  return (
    left.displayOrder - right.displayOrder || left.id.localeCompare(right.id)
  );
}

function compareCandidate(
  left: readonly GuestRoomOption[],
  right: readonly GuestRoomOption[],
  partySize: number,
): number {
  if (left.length !== right.length) return left.length - right.length;

  const leftWaste =
    left.reduce((total, room) => total + room.standardCapacity, 0) - partySize;
  const rightWaste =
    right.reduce((total, room) => total + room.standardCapacity, 0) - partySize;
  if (leftWaste !== rightWaste) return leftWaste - rightWaste;

  const leftSorted = [...left].sort(byDisplayOrder);
  const rightSorted = [...right].sort(byDisplayOrder);
  for (let index = 0; index < leftSorted.length; index += 1) {
    const comparison = byDisplayOrder(leftSorted[index], rightSorted[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function recommendRooms(
  options: readonly GuestRoomOption[],
  partySize: number,
): GuestRoomOption[] | null {
  if (!Number.isInteger(partySize) || partySize <= 0) return null;

  const rooms = [...options].sort(byDisplayOrder);
  let best: GuestRoomOption[] | null = null;

  function search(
    index: number,
    selected: GuestRoomOption[],
    capacity: number,
  ) {
    if (capacity >= partySize) {
      if (!best || compareCandidate(selected, best, partySize) < 0) {
        best = [...selected];
      }
      return;
    }
    if (index >= rooms.length || (best && selected.length >= best.length))
      return;

    selected.push(rooms[index]);
    search(index + 1, selected, capacity + rooms[index].standardCapacity);
    selected.pop();
    search(index + 1, selected, capacity);
  }

  search(0, [], 0);
  return best ? [...best].sort(byDisplayOrder) : null;
}

export function recommendRoomsWithOverflow(
  options: readonly GuestRoomOption[],
  partySize: number,
): { rooms: GuestRoomOption[]; usesOverflow: boolean } | null {
  const standard = recommendRooms(options, partySize);
  if (standard) return { rooms: standard, usesOverflow: false };
  const overflow = recommendRooms(
    options.map((room) => ({
      ...room,
      standardCapacity: room.maximumCapacity,
    })),
    partySize,
  );
  if (!overflow) return null;
  const selectedIds = new Set(overflow.map(({ id }) => id));
  return {
    rooms: options.filter(({ id }) => selectedIds.has(id)),
    usesOverflow: true,
  };
}
