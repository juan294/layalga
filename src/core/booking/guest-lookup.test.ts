import { beforeEach, expect, it, vi } from "vitest";

import { findHouseholds, findStays } from "./guest-lookup";

// Validation and the listing query stay real; only the database answers.
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

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
});

it("finds households by a trimmed name of 2 to 80 characters", async () => {
  sql.mockResolvedValue([{ handle: valid.handle, displayName: "Casa" }]);
  expect(await findHouseholds("  Casa ")).toEqual({
    status: "success",
    listings: [{ handle: valid.handle, displayName: "Casa" }],
    truncated: false,
  });
  expect(sql).toHaveBeenCalledTimes(1);
});

it.each([undefined, null, 7, "a", " a ", "x".repeat(81), ["Casa"]])(
  "refuses the household name %j without a query",
  async (name) => {
    expect(await findHouseholds(name)).toEqual({
      status: "invalid",
      listings: [],
      truncated: false,
    });
    expect(sql).not.toHaveBeenCalled();
  },
);

it("propagates a database failure to the caller", async () => {
  sql.mockRejectedValue(Object.assign(new Error("down"), { code: "57P01" }));
  await expect(findHouseholds("Casa")).rejects.toThrow("down");
  await expect(findStays(valid)).rejects.toThrow("down");
});

it.each([
  { ...valid, nights: "14.0" },
  { ...valid, adults: 1.5 },
  { ...valid, to: "2032-11-01" },
  { ...valid, extra: 1 },
  { ...valid, handle: "invalid" },
  [valid],
  null,
])("refuses the stay criteria %j without a query", async (input) => {
  expect(await findStays(input)).toEqual({
    status: "invalid",
    options: [],
    truncated: false,
  });
  expect(sql).not.toHaveBeenCalled();
});

it("searches a listed household with valid criteria", async () => {
  expect(await findStays(valid)).toEqual({
    status: "not_found",
    options: [],
    truncated: false,
  });
  expect(sql).toHaveBeenCalledTimes(1);
});
