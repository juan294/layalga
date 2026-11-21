import { beforeEach, expect, it, vi } from "vitest";
import { lookupHouseholds, lookupStays } from "./actions";

// Keep the public actions, domain validation and listing lookup real. Substitute
// only the database boundary to count reads and simulate a transient outage.
const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/core/db/client", async (load) => ({
  ...(await load<object>()),
  getDatabaseConnection: () => ({ sql }),
}));

const valid = {
  handle: "d5e0b5a2-5155-4f81-9ab4-05ab2630582f",
  from: "2032-07-01",
  to: "2032-07-28",
  nights: 14,
  adults: 2,
  children: 0,
  pets: 0,
};
const invalid = { status: "invalid", options: [], truncated: false };

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
});

it.each([
  { ...valid, nights: true },
  { ...valid, children: null },
  { ...valid, pets: [] },
  { ...valid, adults: ["2"] },
  { ...valid, children: "" },
  { ...valid, pets: " " },
  { ...valid, nights: "0x0e" },
  { ...valid, nights: "1e1" },
  { ...valid, nights: "+14" },
  { ...valid, nights: "14.0" },
  { ...valid, adults: 1.5 },
  { ...valid, children: -1 },
  { ...valid, adults: 13 },
  { ...valid, to: "2032-11-01" },
  { ...valid, from: ["2032-07-01"] },
  { ...valid, homeId: "other" },
  { ...valid, locale: "en" },
  { ...valid, pets: undefined },
  { ...valid, handle: "invalid" },
])("rejects malformed stay criteria before reading inventory", async (data) => {
  expect(await lookupStays(data)).toEqual(invalid);
  expect(sql).not.toHaveBeenCalled();
});

it.each([null, true, [valid], "booking"])(
  "rejects a non-object stay request",
  async (data) => {
    expect(await lookupStays(data)).toEqual(invalid);
    expect(sql).not.toHaveBeenCalled();
  },
);

it("accepts integers and unsigned decimal form fields", async () => {
  const missing = { status: "not_found", options: [], truncated: false };
  expect(await lookupStays(valid)).toEqual(missing);
  expect(
    await lookupStays({ ...valid, nights: "14", adults: "02", pets: "0" }),
  ).toEqual(missing);
  expect(sql).toHaveBeenCalledTimes(2);
});

it.each([null, true, ["casa"], { name: "casa" }, " "])(
  "rejects malformed listing queries before reading the database",
  async (name) => {
    expect(await lookupHouseholds(name)).toEqual({
      status: "invalid",
      listings: [],
      truncated: false,
    });
    expect(sql).not.toHaveBeenCalled();
  },
);

it("allows both failed searches to be retried without returning stale matches or provider details", async () => {
  const failure = new Error("database connection unavailable");
  sql.mockRejectedValueOnce(failure);
  expect(await lookupHouseholds("Casa")).toEqual({
    status: "unavailable",
    listings: [],
    truncated: false,
  });
  expect(await lookupHouseholds("Casa")).toEqual({
    status: "success",
    listings: [],
    truncated: false,
  });
  sql.mockRejectedValueOnce(failure);
  expect(await lookupStays(valid)).toEqual({
    status: "unavailable",
    options: [],
    truncated: false,
  });
  expect(await lookupStays(valid)).toEqual({
    status: "not_found",
    options: [],
    truncated: false,
  });
});
