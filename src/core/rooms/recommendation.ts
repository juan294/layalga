import type { GuestRoomOption } from "./types";
import { preferenceMask, type RoomPreference } from "./preferences";

function byDisplayOrder(left: GuestRoomOption, right: GuestRoomOption): number {
  return (
    left.displayOrder - right.displayOrder || left.id.localeCompare(right.id)
  );
}
interface Candidate {
  rooms: GuestRoomOption[];
  capacity: number;
  mask: number;
}
function matchedCount(mask: number) {
  let count = 0;
  while (mask) {
    count += mask & 1;
    mask >>>= 1;
  }
  return count;
}
function compareCandidate(left: Candidate, right: Candidate): number {
  if (left.rooms.length !== right.rooms.length)
    return left.rooms.length - right.rooms.length;
  const preferenceDifference =
    matchedCount(right.mask) - matchedCount(left.mask);
  if (preferenceDifference) return preferenceDifference;
  if (left.capacity !== right.capacity) return left.capacity - right.capacity;
  for (let index = 0; index < left.rooms.length; index++) {
    const order = byDisplayOrder(left.rooms[index], right.rooms[index]);
    if (order) return order;
  }
  return 0;
}
export function recommendRooms(
  options: readonly GuestRoomOption[],
  partySize: number,
  preferences: readonly RoomPreference[] = [],
): GuestRoomOption[] | null {
  if (!Number.isSafeInteger(partySize) || partySize <= 0) return null;
  const rooms = options
    .filter(
      (room) =>
        Number.isSafeInteger(room.standardCapacity) &&
        room.standardCapacity > 0,
    )
    .sort(byDisplayOrder);
  if (rooms.reduce((sum, room) => sum + room.standardCapacity, 0) < partySize)
    return null;
  let best: Candidate | null = null;
  // Capacity plus the four-bit preference mask is essential: a weaker partial
  // match can combine with a later room to satisfy more distinct preferences.
  const partial = new Map<string, Candidate>([
    ["0:0", { rooms: [], capacity: 0, mask: 0 }],
  ]);
  for (const room of rooms) {
    const roomMask = preferenceMask([room], preferences);
    for (const selected of [...partial.values()]) {
      const candidate = {
        rooms: [...selected.rooms, room],
        capacity: selected.capacity + room.standardCapacity,
        mask: selected.mask | roomMask,
      };
      if (candidate.capacity >= partySize) {
        if (!best || compareCandidate(candidate, best) < 0) best = candidate;
        continue;
      }
      if (best && candidate.rooms.length >= best.rooms.length) continue;
      const key = `${candidate.capacity}:${candidate.mask}`,
        existing = partial.get(key);
      if (!existing || compareCandidate(candidate, existing) < 0)
        partial.set(key, candidate);
    }
  }
  return best?.rooms ?? null;
}
export function recommendRoomsWithOverflow(
  options: readonly GuestRoomOption[],
  partySize: number,
  preferences: readonly RoomPreference[] = [],
): { rooms: GuestRoomOption[]; usesOverflow: boolean } | null {
  const standard = recommendRooms(options, partySize, preferences);
  if (standard) return { rooms: standard, usesOverflow: false };
  const overflow = recommendRooms(
    options.map((room) => ({
      ...room,
      standardCapacity: room.maximumCapacity,
    })),
    partySize,
    preferences,
  );
  if (!overflow) return null;
  const selectedIds = new Set(overflow.map((room) => room.id));
  return {
    rooms: options.filter((room) => selectedIds.has(room.id)),
    usesOverflow: true,
  };
}
