import { describe, expect, it } from "vitest";

import type { GuestRoomOption } from "./types";
import { recommendRooms, recommendRoomsWithOverflow } from "./recommendation";

function room(
  id: string,
  standardCapacity: number,
  displayOrder: number,
): GuestRoomOption {
  return {
    id,
    guestLabel: id,
    floorLabel: "Ground",
    sleepingArrangement: "Beds",
    overflowArrangement: null,
    standardCapacity,
    maximumCapacity: standardCapacity,
    overflowPolicy: "none",
    displayOrder,
  };
}

describe("recommendRooms", () => {
  it("minimizes room count, then unused capacity, display order, and ID", () => {
    const options = [
      room("z-room", 4, 2),
      room("b-room", 3, 1),
      room("a-room", 3, 1),
      room("small", 2, 0),
    ];

    expect(recommendRooms(options, 3)?.map(({ id }) => id)).toEqual(["a-room"]);
    expect(recommendRooms(options, 5)?.map(({ id }) => id)).toEqual([
      "small",
      "a-room",
    ]);
  });

  it("does not recommend overflow capacity", () => {
    const option = {
      ...room("overflow", 2, 0),
      maximumCapacity: 4,
      overflowArrangement: "Double air mattress",
      overflowPolicy: "host_approval" as const,
    };

    expect(recommendRooms([option], 3)).toBeNull();
    expect(recommendRoomsWithOverflow([option], 3)).toMatchObject({
      rooms: [{ id: "overflow" }],
      usesOverflow: true,
    });
  });
});
