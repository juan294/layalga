import { describe, expect, test } from "vitest";

import { hostDecisionReason } from "./host-decision-context";
import { resumedRunSummary } from "./resume-summary";

const request = "Emma's mother uses a wheelchair and needs ground-floor access";
const reason = hostDecisionReason(
  {
    stay: ["2026-09-19", "2026-09-21"],
    adults: 2,
    children: 0,
    pets: 1,
    specialRequests: [request],
  },
  {
    decision: "interrupt",
    reason: "special_request",
    allocation: [],
    specialRequests: [request],
  },
);

describe("resumed run summary", () => {
  test("reports the recorded approval and verified request instead of model claims", () => {
    const summary = resumedRunSummary({
      locale: "en",
      decisions: [{ approved: true, note: null, reason }],
      visitStatus: "confirmed",
    });

    expect(summary).toContain("| Host review | Approved |");
    expect(summary).toContain(`| Special request | ${request} |`);
    expect(summary).toContain("| Visit | Confirmed |");
    expect(summary).not.toContain("without host escalation");
    expect(summary).not.toContain("No special requests");
  });

  test("does not claim confirmation when the resumed workflow only placed a hold", () => {
    const summary = resumedRunSummary({
      locale: "en",
      decisions: [{ approved: true, note: null, reason }],
      visitStatus: "hold",
    });

    expect(summary).toContain("| Visit | Held pending confirmation |");
    expect(summary).not.toContain("| Visit | Confirmed |");
  });

  test("reports a decline and its note without claiming a visit", () => {
    const summary = resumedRunSummary({
      locale: "en",
      decisions: [
        { approved: false, note: "Please choose another weekend", reason },
      ],
      visitStatus: null,
    });

    expect(summary).toContain("| Host review | Declined |");
    expect(summary).toContain(
      "| Host note | Please choose another weekend |",
    );
    expect(summary).toContain("| Visit | Not confirmed |");
  });

  test("keeps reviewed free text inside one plain table cell", () => {
    const unsafeReason = hostDecisionReason(
      {
        stay: ["2026-09-19", "2026-09-21"],
        adults: 2,
        children: 0,
        pets: 0,
        specialRequests: ["Step-free | **urgent**\nCall first"],
      },
      {
        decision: "interrupt",
        reason: "special_request",
        allocation: [],
        specialRequests: ["Step-free | **urgent**\nCall first"],
      },
    );
    const summary = resumedRunSummary({
      locale: "en",
      decisions: [{ approved: true, note: null, reason: unsafeReason }],
      visitStatus: "confirmed",
    });

    expect(summary).toContain(
      "| Special request | Step-free / urgent Call first |",
    );
  });
});
