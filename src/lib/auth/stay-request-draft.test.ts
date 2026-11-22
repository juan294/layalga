import { expect, it } from "vitest";
import {
  sealStayDraft,
  readStayDraft,
  DRAFT_SECONDS,
} from "./stay-request-draft";

const browser = "a".repeat(43);
const stay = {
  handle: "aca324fb-38cf-4958-b09a-e94135499697",
  criteria: {
    from: "2031-07-01",
    to: "2031-07-15",
    nights: 14,
    adults: 2,
    children: 0,
    pets: 0,
  },
  roomRefs: ["a".repeat(64)],
  overflowConsent: true,
  notes: "Private note",
  requests: "Step-free access",
  locale: "es" as const,
  idempotencyKey: "014bbedd-83bc-4e3c-87ad-296e73a83270",
};

it("retains the exact proposal, key and consent across one browser's sign-in", () => {
  const token = sealStayDraft(stay, browser, "guest", 100);
  expect(token).not.toContain("Private note");
  expect(readStayDraft(token, browser, "other", 101)).toBeNull();
  expect(readStayDraft(token, browser, "guest", 101)).toEqual(stay);
  expect(readStayDraft(token, "b".repeat(43), "guest", 101)).toBeNull();
  expect(readStayDraft(token, undefined, "guest", 101)).toBeNull();
  expect(
    readStayDraft(token, browser, "guest", 100 + DRAFT_SECONDS * 1000),
  ).toBeNull();
});

it("rejects altered, oversized or malformed drafts", () => {
  const token = sealStayDraft(stay, browser, "guest", 100);
  for (const invalid of [token.slice(1), "tampered", "", "x".repeat(100_000)]) {
    expect(readStayDraft(invalid, browser, "guest", 101)).toBeNull();
  }
});
