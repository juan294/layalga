import { describe, expect, it } from "vitest";

import {
  assertChaseRecipient,
  assertGuestNotificationChannel,
  assertReconfirmationRecipientKind,
} from "./notify";

describe("notification authority", () => {
  it("requires a chase to target its visit party", () => {
    expect(() =>
      assertChaseRecipient("reconfirm_chase", "party-b", "party-a"),
    ).toThrow("Chase recipient is not the visit party");
    expect(() =>
      assertChaseRecipient("reconfirm_chase", "party-a", "party-a"),
    ).not.toThrow();
  });

  it("binds reconfirmation kinds to party and host recipients", () => {
    expect(() =>
      assertReconfirmationRecipientKind("reconfirm_chase", "host"),
    ).toThrow();
    expect(() =>
      assertReconfirmationRecipientKind("reconfirm_escalation", "party"),
    ).toThrow();
  });
});

describe("assertGuestNotificationChannel", () => {
  it("allows a party recipient only for reconfirm_chase", () => {
    expect(() =>
      assertGuestNotificationChannel("reconfirm_chase", "party"),
    ).not.toThrow();
  });

  it("allows a host recipient for any kind", () => {
    expect(() =>
      assertGuestNotificationChannel("reconfirm_chase", "host"),
    ).not.toThrow();
    expect(() =>
      assertGuestNotificationChannel("reconfirm_escalation", "host"),
    ).not.toThrow();
    expect(() =>
      assertGuestNotificationChannel("anything_else", "host"),
    ).not.toThrow();
  });

  it("refuses a party recipient for reconfirm_escalation", () => {
    expect(() =>
      assertGuestNotificationChannel("reconfirm_escalation", "party"),
    ).toThrow(
      "Guests receive outcomes through their private link; notify only hosts here",
    );
  });

  it("refuses a party recipient for any non-chase kind", () => {
    expect(() =>
      assertGuestNotificationChannel("hold_confirmed", "party"),
    ).toThrow(
      "Guests receive outcomes through their private link; notify only hosts here",
    );
    expect(() =>
      assertGuestNotificationChannel("visit_rescheduled", "party"),
    ).toThrow(
      "Guests receive outcomes through their private link; notify only hosts here",
    );
  });
});
