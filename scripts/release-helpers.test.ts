import { describe, expect, it } from "vitest";

import {
  assertDemoSnapshot,
  normalizeBaseUrl,
  parseReleaseCliOptions,
  safeErrorMessage,
  type DemoSnapshot,
} from "./release-helpers";

const validSnapshot: DemoSnapshot = {
  visits: [
    { id: "vega", status: "escalated" },
    { id: "oteros", status: "reconfirm_pending" },
  ],
  notifications: [
    { recipient_kind: "party", kind: "reconfirm_chase" },
    { recipient_kind: "party", kind: "reconfirm_chase" },
    { recipient_kind: "host", kind: "reconfirm_escalation" },
    { recipient_kind: "host", kind: "reconfirm_escalation" },
  ],
  decisions: [{ id: "decision", status: "approved" }],
};

describe("assertDemoSnapshot", () => {
  it("accepts four total notifications with exactly two host escalations", () => {
    expect(() => assertDemoSnapshot(validSnapshot)).not.toThrow();
  });

  it("rejects four host notifications", () => {
    expect(() =>
      assertDemoSnapshot({
        ...validSnapshot,
        notifications: validSnapshot.notifications.map(() => ({
          recipient_kind: "host",
          kind: "reconfirm_escalation",
        })),
      }),
    ).toThrow(/exactly two host escalation notifications/i);
  });

  it("rejects a pending host decision", () => {
    expect(() =>
      assertDemoSnapshot({
        ...validSnapshot,
        decisions: [{ id: "decision", status: "pending" }],
      }),
    ).toThrow(/one approved pending decision/i);
  });
});

describe("normalizeBaseUrl", () => {
  it("removes trailing slashes from an HTTP origin", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:3000///")).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("rejects paths and non-HTTP protocols", () => {
    expect(() => normalizeBaseUrl("https://example.test/app")).toThrow();
    expect(() => normalizeBaseUrl("file:///tmp/demo")).toThrow();
  });
});

describe("parseReleaseCliOptions", () => {
  it("accepts the pnpm argument separator", () => {
    expect(
      parseReleaseCliOptions(["--", "--base", "http://localhost:3000"], {}),
    ).toEqual({
      baseUrl: "http://localhost:3000",
      expectedCommit: undefined,
      headed: false,
    });
  });
});

describe("safeErrorMessage", () => {
  it("redacts guest tokens from error stacks", () => {
    const token = "a".repeat(43);
    expect(
      safeErrorMessage(
        new Error(`navigation failed at https://example.test/en/g/${token}`),
      ),
    ).toContain("/en/g/[redacted]");
    expect(safeErrorMessage(new Error(token))).not.toContain(token);
  });
});
