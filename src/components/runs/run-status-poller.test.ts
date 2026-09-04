import { describe, expect, test } from "vitest";

import { scriptedOutcome } from "@/agent/scripted-outcomes";

import { localizedSummary } from "./run-status-poller";

function echoTranslate(key: string): string {
  return key;
}

describe("localizedSummary", () => {
  test("strips markdown emphasis markers from a live model summary (regression: the live Bedrock summary printed **Invitation structured:** verbatim on 2026-09-03)", () => {
    expect(
      localizedSummary(
        "**Invitation structured:** ready for review",
        echoTranslate as never,
      ),
    ).toBe("Invitation structured: ready for review");
  });

  test("still resolves a scripted outcome key instead of stripping it", () => {
    expect(
      localizedSummary(
        scriptedOutcome("invitationReady"),
        echoTranslate as never,
      ),
    ).toBe("outcomes.invitationReady");
  });
});
