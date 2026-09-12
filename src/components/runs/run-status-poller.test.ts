import { describe, expect, test } from "vitest";

import { scriptedOutcome } from "@/agent/scripted-outcomes";

import {
  localizedSummary,
  pollStopAt,
  summaryForDisplay,
} from "./run-status-poller";

function echoTranslate(key: string): string {
  return key;
}

describe("localizedSummary", () => {
  test("removes emoji while preserving markdown for structured rendering", () => {
    expect(
      localizedSummary(
        "### ✅ **Invitation structured:** ready for review",
        echoTranslate as never,
      ),
    ).toBe("### **Invitation structured:** ready for review");
  });

  test("still resolves a scripted outcome key instead of stripping it", () => {
    expect(
      localizedSummary(
        scriptedOutcome("invitationReady"),
        echoTranslate as never,
      ),
    ).toBe("outcomes.invitationReady");
  });

  test("does not expose an interrupted run payload as a public summary", () => {
    expect(
      summaryForDisplay(
        "interrupted",
        '[{"id":"internal","stayApprovalHash":"secret"}]',
        echoTranslate as never,
      ),
    ).toBeNull();
  });
});

describe("pollStopAt", () => {
  const clientNow = Date.UTC(2026, 8, 9, 7, 0, 0); // real browser clock: Sep 9

  test("applies the server's deadline duration relative to the client's own clock, not the server's", () => {
    // Operational timestamps use database wall time. Keep the client on a
    // duration so ordinary server/client clock skew cannot make an absolute
    // server deadline appear expired before the first poll. This also retains
    // the fix for older runs created before operational time was separated
    // from the synthetic household clock.
    const deadlineDurationMs = 4 * 60_000;
    expect(pollStopAt(clientNow, deadlineDurationMs)).toBe(
      clientNow + deadlineDurationMs,
    );
  });

  test("falls back to the default poll deadline when the server sent none", () => {
    const sixMinutes = 6 * 60_000;
    expect(pollStopAt(clientNow, null)).toBe(clientNow + sixMinutes);
  });
});
