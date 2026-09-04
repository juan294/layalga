import { describe, expect, it } from "vitest";

import {
  assertDemoSnapshot,
  markerSuffix,
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
    { recipient_kind: "party", recipient_id: "vega", kind: "reconfirm_chase" },
    {
      recipient_kind: "party",
      recipient_id: "oteros",
      kind: "reconfirm_chase",
    },
    {
      recipient_kind: "host",
      recipient_id: "nel",
      kind: "reconfirm_escalation",
    },
    {
      recipient_kind: "host",
      recipient_id: "covadonga",
      kind: "reconfirm_escalation",
    },
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
          recipient_id: "nel",
          kind: "reconfirm_escalation",
        })),
      }),
    ).toThrow(/exactly two host escalation notifications/i);
  });

  it("rejects two escalations sent to the same host", () => {
    expect(() =>
      assertDemoSnapshot({
        ...validSnapshot,
        notifications: validSnapshot.notifications.map((notification) =>
          notification.recipient_kind === "host"
            ? { ...notification, recipient_id: "nel" }
            : notification,
        ),
      }),
    ).toThrow(/two distinct hosts/i);
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
    expect(normalizeBaseUrl("http://127.0.0.1:3008///")).toBe(
      "http://127.0.0.1:3008",
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
      parseReleaseCliOptions(["--", "--base", "http://localhost:3008"], {}),
    ).toEqual({
      baseUrl: "http://localhost:3008",
      expectedCommit: undefined,
      headed: false,
      expectedRuntime: undefined,
      expectEmail: false,
    });
  });

  it("defaults --expect-email from EMAIL=ses in the script environment", () => {
    expect(parseReleaseCliOptions([], {})).toMatchObject({
      expectEmail: false,
    });
    expect(parseReleaseCliOptions([], { EMAIL: "ses" })).toMatchObject({
      expectEmail: true,
    });
  });

  it("forces expectEmail on with --expect-email regardless of EMAIL", () => {
    expect(parseReleaseCliOptions(["--expect-email"], {})).toMatchObject({
      expectEmail: true,
    });
  });

  it("parses --expect-runtime local or agentcore", () => {
    expect(
      parseReleaseCliOptions(["--expect-runtime", "agentcore"], {}),
    ).toMatchObject({ expectedRuntime: "agentcore" });
    expect(
      parseReleaseCliOptions(["--expect-runtime", "local"], {}),
    ).toMatchObject({ expectedRuntime: "local" });
  });

  it("rejects an unknown --expect-runtime value", () => {
    expect(() =>
      parseReleaseCliOptions(["--expect-runtime", "bogus"], {}),
    ).toThrow(/must be "local" or "agentcore"/);
  });

  it("requires a value for --expect-runtime", () => {
    expect(() => parseReleaseCliOptions(["--expect-runtime"], {})).toThrow(
      /requires a value/,
    );
  });
});

describe("markerSuffix", () => {
  it("wraps the marker in a leading space and brackets", () => {
    expect(markerSuffix("release-probe:abc")).toBe(" [release-probe:abc]");
  });

  it("produces a suffix a tagged raw message ends with", () => {
    const marker = "agentcore-smoke:abc-123";
    const rawMessage = `Some message${markerSuffix(marker)}`;
    expect(rawMessage.endsWith(markerSuffix(marker))).toBe(true);
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
