import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "@/core/db/client";
import { FakeClock } from "@/core/clock";

import { MAX_GUEST_ROOM_INVENTORY } from "./limits";
import {
  loadGuestRoomSearchWindow,
  roomOptionsForStay,
} from "./search";

const homeId = "10000000-0000-4000-8000-000000000001";
const stay = ["2026-09-12", "2026-09-14"] as const;

function databaseFor(rows: unknown[][]): DatabaseClient {
  let index = 0;
  return vi
    .fn()
    .mockImplementation(async () => rows[index++] ?? []) as unknown as DatabaseClient;
}

function roomRow(id = "room-1") {
  return {
    id,
    guest_label: "Garden room",
    floor_label: "Ground floor",
    sleeping_arrangement: "Two single beds",
    overflow_arrangement: null,
    beds: 2,
    maximum_capacity: 2,
    inventory_state: "available" as const,
    overflow_policy: "none" as const,
    display_order: 1,
  };
}

describe("guest room search window", () => {
  it("loads and maps household, inventory, controls, occupancy, and visits", async () => {
    const database = databaseFor([
      [{ pets_together_allowed: false, max_families_with_children: 2 }],
      [roomRow()],
      [
        {
          room_id: "room-1",
          stay_start: "2026-09-12",
          stay_end: "2026-09-14",
          action: "open" as const,
        },
      ],
      [{ room_id: "room-1", stay_start: "2026-09-01", stay_end: "2026-09-02" }],
      [
        {
          id: "visit-1",
          stay_start: "2026-09-13",
          stay_end: "2026-09-15",
          adults: 2,
          children: 0,
          pets: 1,
          status: "confirmed" as const,
          room_ids: ["room-1"],
        },
      ],
    ]);
    const clock = new FakeClock(new Date("2026-09-10T10:00:00.000Z"));

    const result = await loadGuestRoomSearchWindow(
      database,
      clock,
      homeId,
      stay,
    );

    expect(result).toEqual({
      homeId,
      home: { petsTogetherAllowed: false, maxFamiliesWithChildren: 2 },
      rooms: [
        {
          id: "room-1",
          homeId,
          guestLabel: "Garden room",
          floorLabel: "Ground floor",
          sleepingArrangement: "Two single beds",
          overflowArrangement: null,
          standardCapacity: 2,
          maximumCapacity: 2,
          inventoryState: "available",
          overflowPolicy: "none",
          displayOrder: 1,
        },
      ],
      overrides: [
        {
          homeId,
          roomId: "room-1",
          stay: ["2026-09-12", "2026-09-14"],
          action: "open",
        },
      ],
      occupancies: [
        {
          homeId,
          roomId: "room-1",
          stay: ["2026-09-01", "2026-09-02"],
        },
      ],
      visits: [
        {
          id: "visit-1",
          stay: ["2026-09-13", "2026-09-15"],
          adults: 2,
          children: 0,
          pets: 1,
          status: "confirmed",
          roomIds: ["room-1"],
        },
      ],
    });
    expect(roomOptionsForStay(result, stay)).toEqual([
      expect.objectContaining({ id: "room-1", guestLabel: "Garden room" }),
    ]);
  });

  it("rejects a missing home and an inventory result beyond the safety bound", async () => {
    const empty = Array.from({ length: 5 }, () => [] as unknown[]);
    await expect(
      loadGuestRoomSearchWindow(
        databaseFor(empty),
        new FakeClock(new Date("2026-09-10T10:00:00.000Z")),
        homeId,
        stay,
      ),
    ).rejects.toThrow(`Home not found: ${homeId}`);

    const tooManyRooms = Array.from({ length: MAX_GUEST_ROOM_INVENTORY + 1 }, (_, index) =>
      roomRow(`room-${index}`),
    );
    await expect(
      loadGuestRoomSearchWindow(
        databaseFor([[{ pets_together_allowed: true, max_families_with_children: 1 }], tooManyRooms, [], [], []]),
        new FakeClock(new Date("2026-09-10T10:00:00.000Z")),
        homeId,
        stay,
      ),
    ).rejects.toThrow("active rooms");
  });
});
