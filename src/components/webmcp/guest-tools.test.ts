import { describe, expect, it } from "vitest";

import { guestSessionOptionInput } from "@/core/booking/guest-action-input";

import {
  createGuestWebMcpTools,
  type PreparedGuestSearch,
} from "./guest-tools";

const valid = {
  from: "2026-09-01",
  to: "2026-11-30",
  nights: 30,
  adults: 12,
  children: 12,
  pets: 6,
};

function searchFixture() {
  const prepared: PreparedGuestSearch[] = [];
  const search = createGuestWebMcpTools({
    options: [],
    prepareSearch: (value) => prepared.push(value),
    prepareBooking: () => {
      throw new Error("Search must not prepare a booking");
    },
  }).find((tool) => tool.name.endsWith("prepare_search"))!;
  return { search, prepared };
}

describe("guest search preparation contract", () => {
  it("advertises actual party bounds and the date-window limit", () => {
    const { search } = searchFixture();
    expect(search.inputSchema.properties).toMatchObject({
      adults: { maximum: 12 },
      children: { maximum: 12 },
      pets: { maximum: 6 },
      to: { description: expect.stringContaining("90") },
    });
  });

  it.each([
    valid,
    { ...valid, to: "2026-09-02", nights: 1, adults: 1, children: 0, pets: 0 },
    { ...valid, from: "2028-02-29", to: "2028-03-01" },
  ])(
    "prepares valid server-compatible values without submitting",
    async (values) => {
      const { search, prepared } = searchFixture();
      expect(
        guestSessionOptionInput.safeParse({ locale: "en", ...values }).success,
      ).toBe(true);
      await expect(search.execute(values)).resolves.toEqual({
        prepared: true,
        submitted: false,
      });
      expect(prepared).toEqual([values]);
    },
  );

  it.each([
    ["adults", 13],
    ["children", 13],
    ["pets", 7],
    ["nights", 31],
    ["adults", 0],
    ["children", -1],
    ["pets", -1],
    ["nights", 0],
    ["adults", "2"],
    ["children", null],
    ["pets", false],
    ["nights", [2]],
    ["adults", 1.5],
    ["children", NaN],
    ["pets", Infinity],
    ["from", "2026-02-30"],
    ["to", "2026-09-01"],
    ["to", "2026-08-31"],
    ["from", new Date("2026-09-01")],
    ["to", 20261130],
    ["to", "2026-12-01"],
  ])(
    "rejects invalid %s with recovery guidance before changing visible state",
    async (field, value) => {
      const { search, prepared } = searchFixture();
      await expect(
        search.execute({ ...valid, [field as string]: value }),
      ).rejects.toThrow(new RegExp(String(field)));
      expect(prepared).toEqual([]);
    },
  );
});

describe("guest booking preparation availability", () => {
  const option = {
    stay: ["2026-09-18", "2026-09-20"] as const,
    rooms: [{ id: "room-a", guestLabel: "Garden room" }],
    recommendedRoomIds: ["room-a"],
  };
  const names = (bookingAvailable: boolean) =>
    createGuestWebMcpTools({
      options: [option],
      bookingAvailable,
      prepareSearch: () => undefined,
      prepareBooking: () => undefined,
    }).map((tool) => tool.name);

  it("offers booking preparation only while room options are visible", () => {
    expect(names(true)).toContain("layalga.guest.prepare_booking");
    expect(names(false)).not.toContain("layalga.guest.prepare_booking");
    expect(names(false)).toContain("layalga.guest.prepare_search");
  });

  it("tells the caller to run a search when no option is visible", async () => {
    const prepared: unknown[] = [];
    const booking = createGuestWebMcpTools({
      options: [],
      prepareSearch: () => undefined,
      prepareBooking: (value) => prepared.push(value),
    }).find((tool) => tool.name.endsWith("prepare_booking"))!;
    await expect(
      booking.execute({
        stay: "2026-09-18|2026-09-20",
        roomIds: ["room-a"],
        acceptOverflow: false,
      }),
    ).rejects.toThrow(/no room options are visible.*prepare_search/i);
    expect(prepared).toEqual([]);
  });
});
