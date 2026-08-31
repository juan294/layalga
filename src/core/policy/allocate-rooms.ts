export interface RoomCapacity {
  id: string;
  name: string;
  beds: number;
}

/** Allocates whole rooms by count, unused capacity, input order, then ID. */
export function allocateRooms(
  rooms: readonly RoomCapacity[],
  requiredBeds: number,
): RoomCapacity[] | null {
  if (!Number.isInteger(requiredBeds) || requiredBeds < 0) {
    throw new RangeError("requiredBeds must be a non-negative integer");
  }

  if (requiredBeds === 0) return [];

  const ordered = rooms.map((room, index) => ({ room, index }));
  let best: typeof ordered | null = null;

  function compare(left: typeof ordered, right: typeof ordered): number {
    if (left.length !== right.length) return left.length - right.length;
    const leftWaste =
      left.reduce((total, entry) => total + entry.room.beds, 0) - requiredBeds;
    const rightWaste =
      right.reduce((total, entry) => total + entry.room.beds, 0) - requiredBeds;
    if (leftWaste !== rightWaste) return leftWaste - rightWaste;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index].index !== right[index].index) {
        return left[index].index - right[index].index;
      }
      const byId = left[index].room.id.localeCompare(right[index].room.id);
      if (byId !== 0) return byId;
    }
    return 0;
  }

  function search(index: number, selected: typeof ordered, capacity: number) {
    if (capacity >= requiredBeds) {
      if (!best || compare(selected, best) < 0) best = [...selected];
      return;
    }
    if (index >= ordered.length || (best && selected.length >= best.length))
      return;
    selected.push(ordered[index]);
    search(index + 1, selected, capacity + ordered[index].room.beds);
    selected.pop();
    search(index + 1, selected, capacity);
  }

  search(0, [], 0);
  const result = best as typeof ordered | null;
  return result ? result.map(({ room }) => room) : null;
}
