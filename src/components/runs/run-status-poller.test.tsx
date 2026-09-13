import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";

import { scriptedOutcome } from "@/agent/scripted-outcomes";
import en from "../../../messages/en.json";

import {
  localizedSummary,
  pollStopAt,
  RunStatusPoller,
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

  test("localizes completed summaries but omits empty results", () => {
    expect(summaryForDisplay("completed", null, echoTranslate as never)).toBeNull();
    expect(
      summaryForDisplay("completed", "ordinary summary", echoTranslate as never),
    ).toBe("ordinary summary");
  });
});

describe("pollStopAt", () => {
  const clientNow = Date.UTC(2026, 8, 9, 7, 0, 0); // real browser clock: Sep 9

  test("applies the server's deadline duration relative to the client's own clock, not the server's", () => {
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

describe("RunStatusPoller server rendering", () => {
  const initial = {
    id: "10000000-0000-4000-8000-000000000001",
    status: "running" as const,
    summary: null,
    finishedAt: null,
    events: [],
  };

  test("renders the working state without a return link before completion", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <RunStatusPoller
          initial={initial}
          locale="en"
          returnTo="/en"
          showReturnLink={false}
          timeZone="UTC"
          deadlineMs={60_000}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain('data-testid="run-status"');
    expect(html).toContain('data-status="running"');
    expect(html).toContain("Working");
    expect(html).not.toContain('data-testid="run-return"');
  });

  test("renders a finished summary, timeline metadata, and return link", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <RunStatusPoller
          initial={{
            ...initial,
            status: "completed",
            summary: scriptedOutcome("invitationReady"),
            finishedAt: "2026-09-10T10:00:00.000Z",
            executedOn: "local",
            usage: { tokens: 12, tools: 3 },
          }}
          locale="en"
          returnTo="/en/guest"
          timeZone="UTC"
          deadlineMs={null}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain('data-status="completed"');
    expect(html).toContain("The private guest link is ready.");
    expect(html).toContain("12 tokens");
    expect(html).toContain('data-testid="run-return"');
    expect(html).toContain("/en/guest");
  });
});
