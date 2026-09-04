import { describe, expect, test } from "vitest";

import type { GuestRoomOption } from "@/core/rooms/types";

import { toGuestRoomChoice } from "@/core/booking/guest-room-contract";
import {
  guestRoomReviewKey,
  guestSearchIsStale,
  guestSelectionCanSubmit,
} from "./guest-invite-form";

const searched = {
  from: "2026-09-18",
  to: "2026-09-28",
  nights: 2,
  adults: 2,
  children: 0,
  pets: 0,
};

describe("guest exact-room selection", () => {
  test("maps only guest-safe room fields", () => {
    const source: GuestRoomOption & {
      name: string;
      privateNotes: string;
    } = {
      id: "00000000-0000-4000-8000-000000000001",
      guestLabel: "Garden room",
      floorLabel: "Ground floor",
      sleepingArrangement: "Double bed",
      overflowArrangement: "Double air mattress",
      standardCapacity: 2,
      maximumCapacity: 4,
      overflowPolicy: "host_approval",
      displayOrder: 3,
      name: "Internal office",
      privateNotes: "Never send to guests",
    };

    expect(toGuestRoomChoice(source)).toEqual({
      id: source.id,
      guestLabel: "Garden room",
      floorLabel: "Ground floor",
      sleepingArrangement: "Double bed",
      overflowArrangement: "Double air mattress",
      standardCapacity: 2,
      maximumCapacity: 4,
    });
  });

  test("marks dates and every party count as recommendation inputs", () => {
    expect(guestSearchIsStale(searched, searched)).toBe(false);
    expect(guestSearchIsStale(searched, { ...searched, adults: 3 })).toBe(true);
    expect(guestSearchIsStale(searched, { ...searched, children: 1 })).toBe(
      true,
    );
    expect(guestSearchIsStale(searched, { ...searched, pets: 1 })).toBe(true);
    expect(
      guestSearchIsStale(searched, { ...searched, from: "2026-09-19" }),
    ).toBe(true);
  });

  test("resets room state after a new successful search", () => {
    const option = {
      stay: ["2026-09-18", "2026-09-20"] as const,
      rooms: [],
      recommendedRoomIds: ["room-a"],
      hasOverlap: false,
    };
    expect(guestRoomReviewKey(searched, [option])).not.toBe(
      guestRoomReviewKey({ ...searched, adults: 3 }, [
        { ...option, recommendedRoomIds: ["room-b"] },
      ]),
    );
  });

  test("prevents an under-capacity custom room set from being sent", () => {
    expect(guestSelectionCanSubmit(1, 2, 4)).toBe(false);
    expect(guestSelectionCanSubmit(2, 4, 4)).toBe(true);
    expect(guestSelectionCanSubmit(0, 4, 4)).toBe(false);
  });
});
