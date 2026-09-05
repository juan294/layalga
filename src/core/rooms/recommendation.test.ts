import { describe, expect, it } from "vitest";

import type { GuestRoomOption } from "./types";
import { recommendRooms, recommendRoomsWithOverflow } from "./recommendation";
import { explainRoomPreferences } from "./preferences";

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
  it("uses verified ground-floor preference after minimizing room count", () => {
    const upper = { ...room("upper", 2, 0), floorLabel: "Upstairs" };
    const ground = { ...room("ground", 3, 1), floorLabel: "Planta baja" };
    expect(recommendRooms([upper, ground], 2)?.[0]?.id).toBe("upper");
    expect(recommendRooms([upper, ground], 2, ["ground_floor"])?.[0]?.id).toBe(
      "ground",
    );
    expect(
      explainRoomPreferences(
        { status: "available", preferences: ["ground_floor", "separate_beds"] },
        [ground],
      ),
    ).toEqual({
      status: "available",
      matched: ["ground_floor"],
      unmatched: ["separate_beds"],
    });
  });
  it("does not infer accessibility or promote overflow over a standard fit", () => {
    const standard = {
      ...room("standard", 2, 0),
      floorLabel: "Upper",
      sleepingArrangement: "Double bed",
    };
    const overflow = {
      ...room("overflow", 1, 1),
      maximumCapacity: 2,
      floorLabel: "Ground",
      overflowPolicy: "host_approval" as const,
    };
    expect(
      recommendRoomsWithOverflow([standard, overflow], 2, ["ground_floor"])
        ?.rooms[0]?.id,
    ).toBe("standard");
    const ambiguous = {
      ...room("ambiguous", 2, 0),
      floorLabel: "Accessible room",
      sleepingArrangement: "Could have twin beds",
    };
    expect(
      explainRoomPreferences(
        { status: "available", preferences: ["ground_floor", "separate_beds"] },
        [ambiguous],
      ).matched,
    ).toEqual([]);
  });
  it("retains distinct preference masks for later combinations at the same capacity", () => {
    const both = {
      ...room("both", 1, 2),
      floorLabel: "Ground",
      sleepingArrangement: "Separate beds",
    };
    const ground = { ...room("ground", 1, 0), floorLabel: "Ground" };
    const large = {
      ...room("large", 2, 3),
      floorLabel: "Upper",
      sleepingArrangement: "Separate beds",
    };
    expect(
      recommendRooms([both, ground, large], 3, [
        "ground_floor",
        "separate_beds",
      ])?.map((r) => r.id),
    ).toEqual(["ground", "large"]);
  });
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

  it("keeps recommendation work bounded as room count grows", () => {
    const options = Array.from({ length: 100 }, (_, index) =>
      room(`room-${String(index).padStart(3, "0")}`, (index % 4) + 1, index),
    );

    expect(recommendRooms(options, 24)?.map(({ id }) => id)).toEqual([
      "room-003",
      "room-007",
      "room-011",
      "room-015",
      "room-019",
      "room-023",
    ]);
  });
});
