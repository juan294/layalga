import { describe, expect, it } from "vitest";

import type { GuestRoomOption } from "./types";
import { evaluateRoomSelection } from "./occupancy";

const options: GuestRoomOption[] = [
  {
    id: "standard",
    guestLabel: "Standard",
    floorLabel: "Ground",
    sleepingArrangement: "One double bed",
    overflowArrangement: null,
    standardCapacity: 2,
    maximumCapacity: 2,
    overflowPolicy: "none",
    displayOrder: 0,
  },
  {
    id: "overflow",
    guestLabel: "Overflow",
    floorLabel: "Lower",
    sleepingArrangement: "One sofa bed",
    overflowArrangement: "One double air mattress",
    standardCapacity: 2,
    maximumCapacity: 4,
    overflowPolicy: "host_approval",
    displayOrder: 1,
  },
];

describe("evaluateRoomSelection", () => {
  it("rejects empty, duplicate, and unavailable exact selections", () => {
    expect(evaluateRoomSelection([], options, 1, false).decision).toBe("deny");
    expect(
      evaluateRoomSelection(["standard", "standard"], options, 1, false)
        .decision,
    ).toBe("deny");
    expect(
      evaluateRoomSelection(["outside-home"], options, 1, false).decision,
    ).toBe("deny");
  });

  it("allows standard capacity", () => {
    expect(
      evaluateRoomSelection(["standard"], options, 2, false),
    ).toMatchObject({ decision: "allow", usesOverflow: false });
  });

  it("interrupts for consented overflow with the exact arrangement", () => {
    expect(evaluateRoomSelection(["overflow"], options, 4, true)).toMatchObject(
      {
        decision: "interrupt",
        reason: "overflow",
        overflowArrangements: ["One double air mattress"],
      },
    );
  });

  it("denies unconsented overflow and capacity above the maximum", () => {
    expect(
      evaluateRoomSelection(["overflow"], options, 3, false),
    ).toMatchObject({ decision: "deny", reason: "overflow" });
    expect(evaluateRoomSelection(["overflow"], options, 5, true)).toMatchObject(
      { decision: "deny", reason: "capacity" },
    );
  });

  it("reports only the overflow arrangements needed for the party", () => {
    const secondOverflow = {
      ...options[1],
      id: "second-overflow",
      overflowArrangement: "Two folding beds",
      displayOrder: 2,
    };
    expect(
      evaluateRoomSelection(
        ["overflow", "second-overflow"],
        [...options, secondOverflow],
        5,
        true,
      ),
    ).toMatchObject({
      decision: "interrupt",
      overflowArrangements: ["One double air mattress"],
    });
  });
});
