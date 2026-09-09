import { describe, expect, test } from "vitest";

import { scriptedOutcome } from "@/agent/scripted-outcomes";

import { localizedSummary, pollStopAt } from "./run-status-poller";

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

describe("pollStopAt", () => {
  const clientNow = Date.UTC(2026, 8, 9, 7, 0, 0); // real browser clock: Sep 9

  test("applies the server's deadline duration relative to the client's own clock, not the server's", () => {
    // A demo home's deadline_at is computed from the simulated demo clock,
    // which is routinely days behind the real wall clock (regression: a run
    // started 2026-09-07 on the demo clock with a 4-minute deadline stores
    // deadline_at ~= 2026-09-07T08:04, which is already in the past relative
    // to a real client checking on 2026-09-09 -- comparing that absolute
    // server timestamp against the client's own Date.now() made every poll
    // loop stop before its first request, regardless of how the run was
    // actually progressing.
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
