import { describe, expect, test } from "vitest";

import { stayApprovalHash } from "@/core/booking/holds";

import {
  hostDecisionReason,
  hostOverflowDecisionReason,
  verifiedHostDecisionContext,
} from "./host-decision-context";

describe("host decision context", () => {
  test("binds review context and hash to the proposed draft, not the current stay", () => {
    const proposed = {
      visitId: "00000000-0000-4000-8000-000000000501",
      stay: ["2026-10-10", "2026-10-13"] as const,
      adults: 3,
      children: 1,
      pets: 0,
      specialRequests: ["Ground-floor access"],
    };

    const reason = hostDecisionReason(proposed, {
      decision: "interrupt",
      reason: "special_request",
      allocation: [{ id: "room-1", name: "Horreu", beds: 4 }],
      specialRequests: proposed.specialRequests,
    });

    expect(reason.requestedDraft).toEqual({
      stay: ["2026-10-10", "2026-10-13"],
      adults: 3,
      children: 1,
      pets: 0,
      specialRequests: ["Ground-floor access"],
    });
    expect(reason.stayApprovalHash).toBe(stayApprovalHash(proposed));
    expect(verifiedHostDecisionContext(reason)).toEqual({
      stay: ["2026-10-10", "2026-10-13"],
      adults: 3,
      children: 1,
      pets: 0,
      specialRequests: ["Ground-floor access"],
    });
    expect(JSON.stringify(reason)).not.toContain("2026-09-19");
    expect(reason).not.toHaveProperty("visitId");
  });

  test("fails closed when the proposed context does not match its approval hash", () => {
    const reason = hostDecisionReason(
      {
        stay: ["2026-10-10", "2026-10-13"],
        adults: 2,
        children: 0,
        pets: 0,
        specialRequests: ["Ground-floor access"],
      },
      {
        decision: "interrupt",
        reason: "special_request",
        allocation: [],
        specialRequests: ["Ground-floor access"],
      },
    );

    expect(
      verifiedHostDecisionContext({
        ...reason,
        requestedDraft: {
          ...reason.requestedDraft,
          stay: ["2026-11-10", "2026-11-13"],
        },
      }),
    ).toBeNull();
    expect(verifiedHostDecisionContext({ decision: "interrupt" })).toBeNull();
  });

  test("binds overflow approval to canonical room IDs and guest consent", () => {
    const roomId = "00000000-0000-4000-8000-000000000777";
    const proposed = {
      stay: ["2026-10-10", "2026-10-13"] as const,
      adults: 4,
      children: 0,
      pets: 0,
      specialRequests: [] as string[],
      roomIds: [roomId],
      overflowConsent: true,
    };
    const reason = hostOverflowDecisionReason(
      proposed,
      [{ id: roomId, guestLabel: "Lower room" }],
      ["One double air mattress"],
    );

    expect(verifiedHostDecisionContext(reason)).toMatchObject({
      roomIds: [roomId],
      overflowConsent: true,
      overflowRooms: [{ id: roomId, guestLabel: "Lower room" }],
      overflowArrangements: ["One double air mattress"],
    });
    expect(
      verifiedHostDecisionContext({
        ...reason,
        requestedDraft: {
          ...reason.requestedDraft,
          roomIds: ["00000000-0000-4000-8000-000000000778"],
        },
      }),
    ).toBeNull();
  });
});
