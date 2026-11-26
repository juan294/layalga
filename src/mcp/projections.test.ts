import { expect, it } from "vitest";

import type { PublicStayOption } from "@/core/booking/public-stay-search";
import type { StayRequestReceipt } from "@/core/booking/stay-requests";

import {
  householdsAnswer,
  requestsAnswer,
  staysAnswer,
  type StayTerms,
} from "./projections";

const APP = "https://layalga.example";
const HANDLE = "d5e0b5a2-5155-4f81-9ab4-05ab2630582f";

const room = (label: string, change: Record<string, unknown> = {}) => ({
  ref: `ref-${label}-${Math.random()}`,
  guestLabel: label,
  floorLabel: "Ground floor",
  sleepingArrangement: "Double bed",
  overflowArrangement: null,
  standardCapacity: 2,
  maximumCapacity: 2,
  ...change,
});

const option = (
  stay: [string, string],
  rooms: ReturnType<typeof room>[],
  recommended: number[],
): PublicStayOption => ({
  confirmation: "host_approval_required",
  stay,
  rooms,
  recommendedRoomRefs: recommended.map((index) => rooms[index]!.ref),
});

const terms: StayTerms = {
  handle: HANDLE.toUpperCase(),
  from: "2032-07-01",
  to: "2032-07-28",
  nights: 14,
  adults: 2,
  children: 1,
  pets: 0,
};

it("returns a household's handle, name and page, and nothing else", () => {
  const listing = {
    handle: HANDLE,
    displayName: "Casa Vega",
    homeId: "home-canary",
    timezone: "Europe/Madrid",
  };
  expect(
    householdsAnswer({ listings: [listing], truncated: true }, `${APP}/`),
  ).toStrictEqual({
    households: [
      {
        handle: HANDLE,
        name: "Casa Vega",
        pageUrl: `${APP}/stays/${HANDLE}`,
      },
    ],
    truncated: true,
  });
});

it("labels each set of room terms once and links the same search on the website", () => {
  const garden = () => room("Garden");
  const attic = () => room("Attic", { overflowArrangement: "Sofa bed" });
  const answer = staysAnswer(
    {
      options: [
        option(["2032-07-01", "2032-07-15"], [garden(), attic()], [1]),
        // A second garden room with the same terms keeps its own place.
        option(["2032-07-02", "2032-07-16"], [garden(), garden()], [0, 1]),
      ],
      truncated: false,
    },
    terms,
    APP,
  );
  const base = {
    floor: "Ground floor",
    sleepingArrangement: "Double bed",
    standardCapacity: 2,
    maximumCapacity: 2,
  };
  expect(answer).toStrictEqual({
    rooms: [
      { room: "r1", name: "Garden", ...base, overflowArrangement: null },
      { room: "r2", name: "Attic", ...base, overflowArrangement: "Sofa bed" },
    ],
    stays: [
      {
        checkIn: "2032-07-01",
        checkout: "2032-07-15",
        confirmation: "host_approval_required",
        rooms: ["r1", "r2"],
        recommended: ["r2"],
      },
      {
        checkIn: "2032-07-02",
        checkout: "2032-07-16",
        confirmation: "host_approval_required",
        rooms: ["r1", "r1"],
        recommended: ["r1", "r1"],
      },
    ],
    truncated: false,
    continueUrl: `${APP}/stays/${HANDLE}?from=2032-07-01&to=2032-07-28&nights=14&adults=2&children=1&pets=0`,
  });
  expect(JSON.stringify(answer)).not.toContain("ref-");
});

it("keeps a request's household, dates and statuses, newest 20", () => {
  const receipt = (index: number): StayRequestReceipt => ({
    id: `request-${index}`,
    handle: HANDLE,
    displayName: `Household ${index}`,
    stay: ["2032-07-01", "2032-07-15"],
    adults: 2,
    children: 0,
    pets: 0,
    rooms: [room("Garden")],
    overflowConsent: true,
    notes: "canary note",
    requests: "canary request",
    locale: "es",
    status: index === 0 ? "pending" : "confirmed",
    version: 3,
    visitId: index === 0 ? null : `visit-${index}`,
    visitStatus: index === 0 ? null : "confirmed",
    createdAt: "2032-06-01T00:00:00.000Z",
  });
  const answer = requestsAnswer(
    Array.from({ length: 21 }, (_, index) => receipt(index)),
    APP,
  );
  expect(answer.requests).toHaveLength(20);
  expect(answer.requests[0]).toStrictEqual({
    household: "Household 0",
    checkIn: "2032-07-01",
    checkout: "2032-07-15",
    requestStatus: "pending",
    visitStatus: null,
  });
  expect(answer.requests[19]!.household).toBe("Household 19");
  expect(answer).toMatchObject({
    truncated: true,
    historyUrl: `${APP}/requests`,
  });
  expect(
    requestsAnswer(
      Array.from({ length: 20 }, (_, i) => receipt(i)),
      APP,
    ),
  ).toMatchObject({ truncated: false });
  expect(JSON.stringify(answer)).not.toMatch(/canary|request-|visit-|"es"/);
});
