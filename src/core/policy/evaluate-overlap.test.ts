import { describe, expect, it } from "vitest";

import {
  evaluateOverlap,
  type HouseState,
  type VisitDraft,
} from "./evaluate-overlap";

const stays = {
  existing: ["2026-09-18", "2026-09-21"],
  overlap: ["2026-09-19", "2026-09-21"],
  separate: ["2026-09-25", "2026-09-27"],
} as const;

function fixture(
  overrides: Partial<HouseState["home"]> = {},
  visitOverrides: Partial<HouseState["visits"][number]> = {},
): HouseState {
  return {
    home: {
      petsTogetherAllowed: false,
      maxFamiliesWithChildren: 1,
      ...overrides,
    },
    rooms: [
      { id: "horreu", name: "Horreu", beds: 2 },
      { id: "fonte", name: "Fonte", beds: 2 },
      { id: "teixu", name: "Teixu", beds: 3 },
    ],
    visits: [
      {
        id: "existing",
        stay: stays.existing,
        adults: 2,
        children: 2,
        pets: 0,
        status: "confirmed",
        roomIds: ["teixu", "horreu"],
        ...visitOverrides,
      },
    ],
  };
}

function draft(overrides: Partial<VisitDraft> = {}): VisitDraft {
  return {
    stay: stays.overlap,
    adults: 2,
    children: 0,
    pets: 0,
    specialRequests: [],
    ...overrides,
  };
}

describe("evaluateOverlap", () => {
  it.each([
    {
      name: "no overlap",
      draft: draft({ stay: stays.separate }),
      state: fixture(),
      decision: "allow",
      reason: undefined,
      roomIds: ["horreu"],
    },
    {
      name: "no overlap with a special request",
      draft: draft({ stay: stays.separate, specialRequests: ["ground floor"] }),
      state: fixture(),
      decision: "interrupt",
      reason: "special_request",
      roomIds: ["horreu"],
    },
    {
      name: "overlap with enough beds",
      draft: draft(),
      state: fixture(),
      decision: "allow",
      reason: undefined,
      roomIds: ["fonte"],
    },
    {
      name: "overlap without enough beds",
      draft: draft({ adults: 3 }),
      state: fixture(),
      decision: "deny",
      reason: "beds",
      roomIds: [],
    },
    {
      name: "two families with children",
      draft: draft({ adults: 1, children: 1 }),
      state: fixture(),
      decision: "deny",
      reason: "children",
      roomIds: ["fonte"],
    },
    {
      name: "a pet with a pet-free overlapping visit",
      draft: draft({ pets: 1 }),
      state: fixture(),
      decision: "allow",
      reason: undefined,
      roomIds: ["fonte"],
    },
    {
      name: "pets together when forbidden",
      draft: draft({ pets: 1 }),
      state: fixture({}, { pets: 1 }),
      decision: "deny",
      reason: "pets",
      roomIds: ["fonte"],
    },
    {
      name: "pets together when allowed",
      draft: draft({ pets: 1 }),
      state: fixture({ petsTogetherAllowed: true }, { pets: 1 }),
      decision: "allow",
      reason: undefined,
      roomIds: ["fonte"],
    },
    {
      name: "beds denial before a special request",
      draft: draft({ adults: 3, specialRequests: ["ground floor"] }),
      state: fixture(),
      decision: "deny",
      reason: "beds",
      roomIds: [],
    },
    {
      name: "children denial before a special request",
      draft: draft({
        adults: 1,
        children: 1,
        specialRequests: ["ground floor"],
      }),
      state: fixture(),
      decision: "deny",
      reason: "children",
      roomIds: ["fonte"],
    },
    {
      name: "a fitting special request",
      draft: draft({ specialRequests: ["ground floor"] }),
      state: fixture(),
      decision: "interrupt",
      reason: "special_request",
      roomIds: ["fonte"],
    },
    {
      name: "the rescheduled visit itself excluded",
      draft: draft({ visitId: "existing", adults: 2, children: 2 }),
      state: fixture(),
      decision: "allow",
      reason: undefined,
      roomIds: ["horreu", "fonte"],
    },
    {
      name: "a hold counts",
      draft: draft({ adults: 1, children: 1 }),
      state: fixture({}, { status: "hold" }),
      decision: "deny",
      reason: "children",
      roomIds: ["fonte"],
    },
    {
      name: "a cancelled visit does not count",
      draft: draft({ children: 1 }),
      state: fixture({}, { status: "cancelled" }),
      decision: "allow",
      reason: undefined,
      roomIds: ["teixu"],
    },
  ])("handles $name", ({ draft, state, decision, reason, roomIds }) => {
    const result = evaluateOverlap(draft, state);

    expect(result.decision).toBe(decision);
    expect(result.reason).toBe(reason);
    expect(result.allocation.map((room) => room.id)).toEqual(roomIds);
  });

  for (const bedsOk of [false, true]) {
    for (const childrenOk of [false, true]) {
      for (const petsOk of [false, true]) {
        for (const hasRequest of [false, true]) {
          const expected = !bedsOk
            ? ["deny", "beds"]
            : !childrenOk
              ? ["deny", "children"]
              : !petsOk
                ? ["deny", "pets"]
                : hasRequest
                  ? ["interrupt", "special_request"]
                  : ["allow", undefined];

          it(`applies precedence for beds=${bedsOk}, children=${childrenOk}, pets=${petsOk}, request=${hasRequest}`, () => {
            const state = fixture(
              { petsTogetherAllowed: petsOk },
              {
                children: childrenOk ? 0 : 1,
                pets: petsOk ? 0 : 1,
                roomIds: bedsOk
                  ? ["teixu", "horreu"]
                  : ["teixu", "horreu", "fonte"],
              },
            );
            const result = evaluateOverlap(
              draft({
                adults: childrenOk ? 2 : 1,
                children: childrenOk ? 0 : 1,
                pets: petsOk ? 0 : 1,
                specialRequests: hasRequest ? ["ground floor"] : [],
              }),
              state,
            );

            expect([result.decision, result.reason]).toEqual(expected);
          });
        }
      }
    }
  }

  it("treats touching half-open stays as non-overlapping", () => {
    const result = evaluateOverlap(
      draft({ stay: ["2026-09-21", "2026-09-23"], children: 1 }),
      fixture(),
    );

    expect(result.decision).toBe("allow");
  });
});
