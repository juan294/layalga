import { describe, expect, it } from "vitest";

import {
  assertChaseRecipient,
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
