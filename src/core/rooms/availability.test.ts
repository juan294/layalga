import { describe, expect, it } from "vitest";

import { resolveGuestRoomOptions } from "./availability";
import type { RoomInventoryRecord } from "./types";

const stay = ["2026-09-10", "2026-09-14"] as const;

function room(
  id: string,
  inventoryState: RoomInventoryRecord["inventoryState"] = "available",
): RoomInventoryRecord {
  return {
    id,
    homeId: "home-a",
    guestLabel: id,
    floorLabel: "Ground",
    sleepingArrangement: "One double bed",
    overflowArrangement: null,
    standardCapacity: 2,
    maximumCapacity: 2,
    overflowPolicy: "none",
    inventoryState,
    displayOrder: 0,
  };
}

describe("resolveGuestRoomOptions", () => {
  it("fails closed for incomplete, draft, inactive, cross-home, closed, and occupied rooms", () => {
    const crossHome = { ...room("cross-home"), homeId: "home-b" };
    const incomplete = { ...room("incomplete"), guestLabel: null };
    const result = resolveGuestRoomOptions({
      homeId: "home-a",
      stay,
      rooms: [
        room("open"),
        room("draft", "draft"),
        room("inactive", "inactive"),
        room("closed"),
        room("occupied"),
        incomplete,
        crossHome,
      ],
      overrides: [
        {
          roomId: "closed",
          homeId: "home-a",
          stay: ["2026-09-12", "2026-09-13"],
          action: "close",
        },
      ],
      occupancies: [
        {
          roomId: "occupied",
          homeId: "home-a",
          stay: ["2026-09-09", "2026-09-11"],
        },
      ],
    });

    expect(result.map(({ id }) => id)).toEqual(["open"]);
  });

  it("opens a withheld room only when one opening contains the full stay", () => {
    const withheld = room("withheld", "withheld");
    const partial = resolveGuestRoomOptions({
      homeId: "home-a",
      stay,
      rooms: [withheld],
      overrides: [
        {
          roomId: withheld.id,
          homeId: "home-a",
          stay: ["2026-09-10", "2026-09-12"],
          action: "open",
        },
      ],
      occupancies: [],
    });
    const full = resolveGuestRoomOptions({
      homeId: "home-a",
      stay,
      rooms: [withheld],
      overrides: [
        {
          roomId: withheld.id,
          homeId: "home-a",
          stay: ["2026-09-01", "2026-09-20"],
          action: "open",
        },
      ],
      occupancies: [],
    });

    expect(partial).toEqual([]);
    expect(full.map(({ id }) => id)).toEqual(["withheld"]);
  });

  it("returns only the explicit guest DTO", () => {
    const source = { ...room("safe"), privateNotes: "never expose" };
    const [option] = resolveGuestRoomOptions({
      homeId: "home-a",
      stay,
      rooms: [source],
      overrides: [],
      occupancies: [],
    });

    expect(Object.keys(option!).sort()).toEqual(
      [
        "displayOrder",
        "floorLabel",
        "guestLabel",
        "id",
        "maximumCapacity",
        "overflowArrangement",
        "overflowPolicy",
        "sleepingArrangement",
        "standardCapacity",
      ].sort(),
    );
    expect(JSON.stringify(option)).not.toContain("never expose");
  });

  it("fails closed for blank labels and inconsistent capacity metadata", () => {
    const result = resolveGuestRoomOptions({
      homeId: "home-a",
      stay,
      rooms: [
        { ...room("blank"), guestLabel: "  " },
        { ...room("zero"), standardCapacity: 0, maximumCapacity: 0 },
        {
          ...room("unexplained-overflow"),
          maximumCapacity: 4,
          overflowArrangement: null,
          overflowPolicy: "none",
        },
      ],
      overrides: [],
      occupancies: [],
    });

    expect(result).toEqual([]);
  });
});
