import { describe, expect, test } from "vitest";

import type { VisitDraft } from "@/core/policy/evaluate-overlap";

import { stayApprovalHash } from "./holds";

const draft: VisitDraft = {
  stay: ["2026-10-10", "2026-10-12"],
  adults: 2,
  children: 0,
  pets: 0,
  specialRequests: [],
  roomIds: ["00000000-0000-4000-8000-000000000001"],
};

describe("stay approval hash", () => {
  test("normalizes omitted and false overflow consent but binds true consent", () => {
    expect(stayApprovalHash(draft)).toBe(
      stayApprovalHash({ ...draft, overflowConsent: false }),
    );
    expect(stayApprovalHash(draft)).not.toBe(
      stayApprovalHash({ ...draft, overflowConsent: true }),
    );
  });
});
