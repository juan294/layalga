import { describe, expect, it } from "vitest";
import type { GuestRoomSearchWindow } from "@/core/rooms/search";
import { enumerateStayOptions } from "./stay-options";

const room = {
  id: "guest-room",
  homeId: "home",
  guestLabel: "Guest Room",
  floorLabel: "Upper floor",
  sleepingArrangement: "Double bed",
  overflowArrangement: null,
  standardCapacity: 2,
  maximumCapacity: 2,
  inventoryState: "available",
  overflowPolicy: "none",
  displayOrder: 1,
} as const;
const window: GuestRoomSearchWindow = {
  homeId: "home",
  home: { petsTogetherAllowed: false, maxFamiliesWithChildren: 1 },
  rooms: [room],
  visits: [],
  occupancies: [],
  overrides: [],
};
const input = {
  from: "2027-07-01",
  to: "2027-07-16",
  nights: 14,
  adults: 2,
  children: 0,
  pets: 0,
};
describe("consecutive stays", () => {
  it("keeps the same rooms for the entire stay, allows checkout-day turnover, and preserves date order", () => {
    const occupied = {
      ...window,
      occupancies: [
        {
          homeId: "home",
          roomId: room.id,
          stay: ["2027-06-20", "2027-07-02"] as const,
        },
      ],
    };
    expect(
      [...enumerateStayOptions(occupied, input, [])].map(
        (option) => option.stay,
      ),
    ).toEqual([["2027-07-02", "2027-07-16"]]);
    expect(
      [...enumerateStayOptions(window, input, [])].map((option) => option.stay),
    ).toEqual([
      ["2027-07-01", "2027-07-15"],
      ["2027-07-02", "2027-07-16"],
    ]);
  });
  it("keeps withhold, overflow and household overlap rules in the common search", () => {
    const withheld = {
      ...room,
      inventoryState: "withheld" as const,
      maximumCapacity: 3,
      overflowArrangement: "Day bed",
      overflowPolicy: "host_approval" as const,
    };
    const opened: GuestRoomSearchWindow = {
      ...window,
      rooms: [withheld],
      overrides: [
        {
          homeId: "home",
          roomId: room.id,
          action: "open",
          stay: ["2027-07-01", "2027-07-15"],
        },
      ],
    };
    const pets = { ...input, adults: 3, pets: 1 };
    expect(
      [...enumerateStayOptions(opened, pets, [])].map((option) => option.stay),
    ).toEqual([["2027-07-01", "2027-07-15"]]);
    const visit = {
      id: "other",
      stay: ["2027-07-04", "2027-07-05"] as const,
      adults: 1,
      children: 1,
      pets: 1,
      roomIds: [],
      status: "confirmed" as const,
    };
    expect([
      ...enumerateStayOptions({ ...opened, visits: [visit] }, pets, []),
    ]).toEqual([]);
    expect([
      ...enumerateStayOptions(
        { ...opened, visits: [visit] },
        { ...input, children: 1 },
        [],
      ),
    ]).toEqual([]);
  });
});
