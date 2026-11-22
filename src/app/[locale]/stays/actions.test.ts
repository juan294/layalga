import { beforeEach, expect, it, vi } from "vitest";
import { guestConversationTurn } from "./conversation-actions";
import { lookupHouseholds, lookupStays } from "./actions";

// Keep the public actions, domain validation and listing lookup real. Substitute
// only the database boundary to count reads and simulate a transient outage.
const { sql, getUser } = vi.hoisted(() => ({ sql: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
const verified = {
  id: "guest",
  email: "guest@example.invalid",
  email_confirmed_at: "2030-01-01",
  identities: [{ provider: "google" }],
};
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
  getUser.mockResolvedValue({ data: { user: verified } });
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

it.each([
  null,
  { ...verified, identities: [{ provider: "email" }] },
  { ...verified, email_confirmed_at: null },
])(
  "requires a verified Google session before discovery, availability, and conversation",
  async (user) => {
    getUser.mockResolvedValue({ data: { user } });
    expect(await lookupHouseholds("Casa")).toMatchObject({
      status: "sign_in",
      listings: [],
    });
    expect(await lookupStays(valid)).toMatchObject({
      status: "sign_in",
      options: [],
    });
    expect(
      await guestConversationTurn({
        locale: "es",
        message: "envía mi solicitud",
      }),
    ).toMatchObject({
      kind: "sign_in",
      state: {},
      message: expect.stringMatching(/Google/),
    });
    expect(sql).not.toHaveBeenCalled();
  },
);

it("returns retryable failures when the session cannot be verified", async () => {
  getUser.mockRejectedValue(new Error("auth unavailable"));
  expect(await lookupHouseholds("Casa")).toMatchObject({
    status: "unavailable",
    listings: [],
  });
  expect(await lookupStays(valid)).toMatchObject({
    status: "unavailable",
    options: [],
  });
  expect(
    await guestConversationTurn({
      locale: "en",
      message: "show me a household",
    }),
  ).toMatchObject({ kind: "unavailable", state: {} });
  expect(sql).not.toHaveBeenCalled();
});
