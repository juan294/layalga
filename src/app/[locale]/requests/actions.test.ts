import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lookup: vi.fn(),
  submit: vi.fn(),
  withdraw: vi.fn(),
  existing: vi.fn(),
  getUser: vi.fn(),
  after: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: api.get, set: api.set }),
}));
vi.mock("next/server", () => ({ after: api.after }));
vi.mock("@/core/booking/public-stay-search", () => ({
  resolvePublicStaySelection: api.lookup,
}));
vi.mock("@/core/booking/stay-requests", () => ({
  submitStayRequest: api.submit,
  withdrawStayRequest: api.withdraw,
  findSubmittedStayRequest: api.existing,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: api.getUser } }),
}));
import {
  prepareStayRequest,
  reviewStayRequest,
  sendStayRequest,
  withdrawMyRequest,
} from "./actions";
import { sealStayDraft } from "@/lib/auth/stay-request-draft";
const email = "guest@example.invalid";
const browser = "b".repeat(43);
const user = {
  id: "user-id",
  email,
  email_confirmed_at: "2030-01-01",
  identities: [{ provider: "google" }],
};
const input = {
  handle: "b99bacf7-77ab-45bd-b890-d4eb616b4616",
  criteria: {
    from: "2031-07-01",
    to: "2031-07-15",
    nights: 14,
    adults: 2,
    children: 0,
    pets: 0,
  },
  roomRefs: ["a".repeat(64)],
  overflowConsent: false,
  notes: "quiet please",
  requests: "",
  locale: "en" as const,
  idempotencyKey: "a3f1f374-f856-49f8-99eb-da36a137fe99",
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getUser.mockResolvedValue({ data: { user } });
  api.existing.mockResolvedValue(null);
  api.get.mockReturnValue({ value: browser });
  api.lookup.mockResolvedValue({
    homeId: "private-id",
    roomIds: ["private-room"],
    rooms: [{ guestLabel: "North", ref: "a".repeat(64) }],
    displayName: "Fixture",
  });
  api.submit.mockResolvedValue({ status: "pending", requestId: "receipt" });
});

it("prepares, signs in and reviews without submitting or scheduling messages", async () => {
  const draft = await prepareStayRequest(input);
  expect(draft).toMatchObject({ status: "ready", token: expect.any(String) });
  if (draft.status !== "ready") throw new Error("setup");
  const review = await reviewStayRequest(draft.token);
  expect(review).toMatchObject({
    status: "ready",
    notes: input.notes,
    displayName: "Fixture",
  });
  expect(JSON.stringify(review)).not.toContain("private-id");
  expect(JSON.stringify(review)).not.toContain("private-room");
  expect(api.submit).not.toHaveBeenCalled();
  expect(api.after).not.toHaveBeenCalled();
});

it("reports changed room terms on return", async () => {
  const token = sealStayDraft(input, browser);
  api.lookup.mockResolvedValueOnce(null);
  expect(await reviewStayRequest(token)).toEqual({ status: "stale" });
  expect(api.submit).not.toHaveBeenCalled();
});

it("verifies identity anew and rejects expired or unbound drafts", async () => {
  const token = sealStayDraft(input, browser);
  api.getUser.mockResolvedValueOnce({ data: { user: null } });
  expect((await sendStayRequest(token, email)).status).toBe("sign_in");
  expect((await sendStayRequest(token, "other@example.invalid")).status).toBe(
    "changed_account",
  );
  expect(
    (await sendStayRequest(sealStayDraft(input, browser, 1), email)).status,
  ).toBe("expired");
  expect(api.submit).not.toHaveBeenCalled();
});

it("sends the reviewed payload only on explicit action and preserves its key on replay", async () => {
  const token = sealStayDraft(input, browser);
  expect(await sendStayRequest(token, email)).toEqual({
    status: "pending",
    requestId: "receipt",
  });
  api.submit.mockResolvedValueOnce({
    status: "replayed",
    requestId: "receipt",
  });
  expect(await sendStayRequest(token, email)).toEqual({
    status: "replayed",
    requestId: "receipt",
  });
  expect(api.submit).toHaveBeenCalledWith({ userId: "user-id", email }, input);
  expect(api.lookup).not.toHaveBeenCalled(); // The domain resolves idempotent replay before inventory.
  expect(api.after).toHaveBeenCalledTimes(2);
});

it("withdraws only as the signed-in requester", async () => {
  api.getUser.mockResolvedValueOnce({ data: { user: null } });
  expect(await withdrawMyRequest(input.idempotencyKey)).toBe("sign_in");
  expect(api.withdraw).not.toHaveBeenCalled();
  api.withdraw.mockResolvedValueOnce({ status: "withdrawn" });
  expect(await withdrawMyRequest(input.idempotencyKey)).toBe("withdrawn");
  expect(api.withdraw).toHaveBeenCalledWith(user.id, input.idempotencyKey);
});

it("recovers a committed receipt before checking changed inventory following a lost response", async () => {
  const token = sealStayDraft(input, browser);
  api.existing.mockResolvedValueOnce({
    status: "replayed",
    requestId: "receipt",
  });
  expect(await reviewStayRequest(token)).toEqual({
    status: "replayed",
    requestId: "receipt",
  });
  expect(api.lookup).not.toHaveBeenCalled();
  expect(api.submit).not.toHaveBeenCalled();
});

it("returns the committed receipt even if background email scheduling fails", async () => {
  api.after.mockImplementationOnce(() => {
    throw new Error("task unavailable");
  });
  expect(await sendStayRequest(sealStayDraft(input, browser), email)).toEqual({
    status: "pending",
    requestId: "receipt",
  });
});
