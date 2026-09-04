import { describe, expect, it } from "vitest";

import {
  guestSessionOptionInput,
  guestSessionSubmitInput,
  guestTokenOptionInput,
  guestTokenSubmitInput,
} from "./guest-action-input";

describe("guest action input schemas", () => {
  it("shares option validation while requiring a token only on token routes", () => {
    const values = {
      locale: "en",
      from: "2026-09-18",
      to: "2026-09-20",
      nights: "2",
      adults: "2",
      children: "0",
      pets: "0",
    };

    expect(guestSessionOptionInput.safeParse(values).success).toBe(true);
    expect(guestTokenOptionInput.safeParse(values).success).toBe(false);
    expect(
      guestTokenOptionInput.safeParse({ ...values, token: "guest-token" })
        .success,
    ).toBe(true);
  });

  it("preserves the date-window refinement on the token schema", () => {
    expect(
      guestTokenOptionInput.safeParse({
        token: "guest-token",
        locale: "en",
        from: "2026-09-20",
        to: "2026-09-18",
        nights: "2",
        adults: "2",
        children: "0",
        pets: "0",
      }).success,
    ).toBe(false);
  });

  it("shares submit validation while requiring a token only on token routes", () => {
    const values = {
      locale: "es",
      stay: "2026-09-18|2026-09-20",
      adults: "2",
      children: "0",
      pets: "0",
      roomIds: ["00000000-0000-4000-8000-000000000701"],
      overflowConsent: false,
    };

    expect(guestSessionSubmitInput.safeParse(values).success).toBe(true);
    expect(guestTokenSubmitInput.safeParse(values).success).toBe(false);
    expect(
      guestTokenSubmitInput.safeParse({ ...values, token: "guest-token" })
        .success,
    ).toBe(true);
  });
});
