export interface RoomCapacity {
  id: string;
  name: string;
  beds: number;
}

/**
 * Allocates whole rooms for a stay. Rooms are packed largest first and ties
 * retain their input order so the result is deterministic.
 */
export function allocateRooms(
  rooms: readonly RoomCapacity[],
  requiredBeds: number,
): RoomCapacity[] | null {
  if (!Number.isInteger(requiredBeds) || requiredBeds < 0) {
    throw new RangeError("requiredBeds must be a non-negative integer");
  }

  if (requiredBeds === 0) return [];

  const availableBeds = rooms.reduce((total, room) => total + room.beds, 0);
  if (availableBeds < requiredBeds) return null;

  const largestFirst = rooms
    .map((room, index) => ({ room, index }))
    .sort(
      (left, right) =>
        right.room.beds - left.room.beds || left.index - right.index,
    );

  const allocation: RoomCapacity[] = [];
  let allocatedBeds = 0;

  for (const { room } of largestFirst) {
    allocation.push(room);
    allocatedBeds += room.beds;
    if (allocatedBeds >= requiredBeds) return allocation;
  }

  return null;
}
