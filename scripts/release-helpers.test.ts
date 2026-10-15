import { describe, expect, it } from "vitest";

import {
  markerSuffix,
  normalizeBaseUrl,
  parseReleaseCliOptions,
  safeErrorMessage,
} from "./release-helpers";

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
      expectedRuntime: undefined,
      expectMemory: false,
      target: "local",
      cleanupOnly: undefined,
    });
  });

  it("selects the production probe target", () => {
    expect(
      parseReleaseCliOptions(["--target", "production"], {}),
    ).toMatchObject({ target: "production" });
    expect(() => parseReleaseCliOptions(["--target", "staging"], {})).toThrow(
      /must be "local" or "production"/,
    );
  });

  it("parses --cleanup-only with a run id", () => {
    const runId = "33333333-3333-4333-8333-333333333333";
    expect(
      parseReleaseCliOptions(["--", "--cleanup-only", runId], {}),
    ).toMatchObject({ cleanupOnly: runId });
    expect(() =>
      parseReleaseCliOptions(["--cleanup-only", "not-a-run"], {}),
    ).toThrow(/run id/i);
  });

  it("no longer accepts the demo-only flags", () => {
    expect(() => parseReleaseCliOptions(["--expect-email"], {})).toThrow(
      /Unknown argument/,
    );
    expect(() => parseReleaseCliOptions(["--headed"], {})).toThrow(
      /Unknown argument/,
    );
  });

  it("defaults --expect-memory from MEMORY=agentcore in the script environment", () => {
    expect(parseReleaseCliOptions([], {})).toMatchObject({
      expectMemory: false,
    });
    expect(parseReleaseCliOptions([], { MEMORY: "agentcore" })).toMatchObject({
      expectMemory: true,
    });
    expect(parseReleaseCliOptions([], { MEMORY: "none" })).toMatchObject({
      expectMemory: false,
    });
  });

  it("forces expectMemory on with --expect-memory regardless of MEMORY", () => {
    expect(parseReleaseCliOptions(["--expect-memory"], {})).toMatchObject({
      expectMemory: true,
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
