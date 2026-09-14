import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "@/core/db/client";
import { FakeClock } from "@/core/clock";

const listGuestRoomOptions = vi.hoisted(() => vi.fn());
vi.mock("@/core/rooms/availability", () => ({ listGuestRoomOptions }));

import { loadHouseState } from "./house-state";

const homeId = "10000000-0000-4000-8000-000000000001";
const visitId = "10000000-0000-4000-8000-000000000002";

function databaseFor(homeRows: unknown[], visitRows: unknown[]): DatabaseClient {
  let call = 0;
  return vi.fn(async () => (call++ === 0 ? homeRows : visitRows)) as unknown as DatabaseClient;
}

describe("loadHouseState", () => {
  it("maps policy, available rooms, and active visits for the draft stay", async () => {
    const database = databaseFor(
      [{ pets_together_allowed: true, max_families_with_children: 1 }],
      [
        {
          id: visitId,
          stay_start: "2026-09-12",
          stay_end: "2026-09-14",
          adults: 2,
          children: 1,
          pets: 0,
          status: "confirmed",
          room_ids: ["room-1"],
        },
      ],
    );
    listGuestRoomOptions.mockResolvedValue([
      { id: "room-1", guestLabel: "Garden room", standardCapacity: 2 },
    ]);
    const clock = new FakeClock(new Date("2026-09-10T10:00:00.000Z"));
    const draft = {
      visitId,
      stay: [new Date("2026-09-12T00:00:00.000Z"), "2026-09-14"] as const,
      adults: 2,
      children: 1,
      pets: 0,
      specialRequests: [],
    };

    await expect(loadHouseState(database, clock, homeId, draft)).resolves.toEqual({
      home: { petsTogetherAllowed: true, maxFamiliesWithChildren: 1 },
      rooms: [{ id: "room-1", name: "Garden room", beds: 2 }],
      visits: [
        {
          id: visitId,
          stay: ["2026-09-12", "2026-09-14"],
          adults: 2,
          children: 1,
          pets: 0,
          status: "confirmed",
          roomIds: ["room-1"],
        },
      ],
    });
    expect(listGuestRoomOptions).toHaveBeenCalledWith(
      database,
      homeId,
      ["2026-09-12", "2026-09-14"],
      3,
      { excludeVisitId: visitId },
    );
  });

  it("fails when the household does not exist", async () => {
    await expect(
      loadHouseState(
        databaseFor([], []),
        new FakeClock(new Date("2026-09-10T10:00:00.000Z")),
        homeId,
        {
          stay: ["2026-09-12", "2026-09-14"],
          adults: 1,
          children: 0,
          pets: 0,
          specialRequests: [],
        },
      ),
    ).rejects.toThrow(`Home not found: ${homeId}`);
  });
});
