import { readFile } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/app/[locale]/(host)/actions", () => ({
  decideAction: vi.fn(),
}));

import en from "../../messages/en.json";
import es from "../../messages/es.json";

import {
  calendarMonthFromSearch,
  calendarMonthWindow,
  steadyPollDelay,
} from "./frontend-utils";
import {
  activityPolicyLabelKey,
  activityToolLabelKey,
} from "./host/activity-labels";
import { CalendarLedger } from "./host/calendar-ledger";
import { decisionButtonState } from "./host/pending-decision-button";
import { PendingDecisions } from "./host/pending-decisions";
import {
  guestVisitPresentation,
  type GuestVisitPresentationInput,
} from "./guest/guest-visit-presentation";
import {
  SCRIPTED_OUTCOME_PREFIX,
  scriptedOutcome,
  scriptedOutcomeKey,
} from "@/agent/scripted-outcomes";

describe("product and UX remediation contracts", () => {
  test("bounds a requested calendar month and preserves cross-month stays", () => {
    const fallback = new Date("2026-09-01T00:00:00.000Z");

    expect(calendarMonthFromSearch("2026-10", fallback).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    expect(calendarMonthFromSearch("not-a-month", fallback)).toBe(fallback);
    expect(calendarMonthWindow(new Date("2026-09-01T00:00:00.000Z"))).toEqual({
      from: "2026-09-01",
      to: "2026-10-01",
    });

    const html = renderToStaticMarkup(
      <CalendarLedger
        emptyLabel="No visits"
        locale="en"
        month={fallback}
        navigation={{
          previousHref: "/en?month=2026-08",
          previousLabel: "Previous month",
          nextHref: "/en?month=2026-10",
          nextLabel: "Next month",
          visitCountLabel: "1 visit this month",
        }}
        roomsLabel="Rooms"
        statusLabels={{ confirmed: "Confirmed" }}
        visits={[
          {
            id: "cross-month",
            familyName: "Familia Vega",
            start: "2026-08-30",
            end: "2026-09-03",
            status: "confirmed",
            rooms: ["Horreu"],
          },
        ]}
      />,
    );

    expect(html).toContain("Familia Vega");
    expect(html).toContain("Previous month");
    expect(html).toContain("Next month");
    expect(html).toContain("1 visit this month");
  });

  test("keeps unrelated decision cards enabled while one card is pending", () => {
    expect(decisionButtonState(false, null, "approve")).toEqual({
      disabled: false,
      active: false,
    });
    expect(decisionButtonState(true, "approve", "approve")).toEqual({
      disabled: true,
      active: true,
    });
    expect(decisionButtonState(true, "approve", "decline")).toEqual({
      disabled: true,
      active: false,
    });
  });

  test("labels requested stay and request time separately on a decision card", () => {
    const html = renderToStaticMarkup(
      <PendingDecisions
        decisions={[
          {
            id: "decision-1",
            status: "pending",
            partyName: "The Oteros",
            partySummary: "2 adults · 0 children · 1 pet",
            reason: "The guest included a special request",
            requestDetail: "Ground-floor access",
            overlapSummary: "1 other stay overlaps; guest names stay private",
            note: null,
            applicationFailed: false,
            requestedStay: "Sep 19, 2026 – Sep 21, 2026",
            createdAt: "Sep 7, 2026, 10:00 AM",
          },
        ]}
        labels={{
          empty: "No decisions",
          reason: "Reason",
          requestDetail: "Request detail",
          overlap: "Overlap",
          requestedStay: "Requested stay",
          createdAt: "Requested at",
          note: "Note",
          notePlaceholder: "Optional note",
          approve: "Approve",
          approving: "Approving…",
          decline: "Decline",
          declining: "Declining…",
          retryApproved: "Retry approval",
          retryApproving: "Retrying approval…",
          retryDeclined: "Retry decline",
          retryDeclining: "Retrying decline…",
          retryHelp: "Retry help",
          applying: "Applying decision",
        }}
        locale="en"
      />,
    );

    expect(html).toContain("Requested stay");
    expect(html).toContain("Sep 19, 2026 – Sep 21, 2026");
    expect(html).toContain("Requested at");
    expect(html).toContain("Sep 7, 2026, 10:00 AM");
    expect(html).toContain("Ground-floor access");
    expect(html).not.toContain("The Oteros overlaps");
  });

  test("backs successful run polling off without delaying the first check", () => {
    expect(steadyPollDelay(0)).toBe(1_500);
    expect(steadyPollDelay(1)).toBe(3_000);
    expect(steadyPollDelay(3)).toBe(8_000);
    expect(steadyPollDelay(20)).toBe(15_000);
  });

  test("allows pre-arrival reconfirmed changes and explains hold expiry", () => {
    const base: GuestVisitPresentationInput = {
      status: "reconfirmed",
      preArrival: true,
      holdExpired: false,
    };
    expect(guestVisitPresentation(base).canChange).toBe(true);
    expect(
      guestVisitPresentation({ ...base, preArrival: false }).canChange,
    ).toBe(false);
    expect(
      guestVisitPresentation({
        ...base,
        status: "hold",
        holdExpired: true,
      }),
    ).toMatchObject({
      canChange: true,
      statusKey: "holdExpired",
      holdMessageKey: "holdExpiredBody",
    });
  });

  test("uses stable scripted outcomes and localized display keys", () => {
    const summary = scriptedOutcome("invitationReady");
    expect(summary).toBe(`${SCRIPTED_OUTCOME_PREFIX}invitationReady`);
    expect(scriptedOutcomeKey(summary)).toBe("invitationReady");
    expect(scriptedOutcomeKey("A provider summary")).toBeNull();
    expect(en.Runs.outcomes.invitationReady).not.toBe(
      es.Runs.outcomes.invitationReady,
    );
    expect(activityToolLabelKey("create_temporary_hold")).toBe(
      "createTemporaryHold",
    );
    expect(activityPolicyLabelKey("interrupt")).toBe("interrupt");
    expect(activityToolLabelKey("unknown_tool")).toBeNull();
  });

  test("keeps the mobile WebKit acceptance lane narrow", async () => {
    const config = await readFile(
      new URL("../../playwright.config.ts", import.meta.url),
      "utf8",
    );
    expect(config).toContain('name: "mobile-webkit"');
    expect(config).toContain("grep: /@mobile/");
    expect(config).toContain("grepInvert: /@mobile/");
  });

  test("scopes account retrieval to the verified auth user without returning a link token", async () => {
    const source = await readFile(
      new URL("../lib/auth/guest-account.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("where p.auth_user_id = ${authUserId}");
    expect(source).not.toMatch(/select[^;]*link_token/is);
    expect(source).not.toContain("user_metadata");
  });
});
