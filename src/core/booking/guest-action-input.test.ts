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

it("bounds information and explicit requests independently", () => {
  const input = {
    locale: "en",
    stay: "2026-10-02|2026-10-04",
    adults: 2,
    children: 0,
    pets: 0,
    roomIds: ["10000000-0000-4000-8000-000000000001"],
    overflowConsent: false,
    notes: "n".repeat(1000),
    requests: "r".repeat(500),
  };
  expect(guestSessionSubmitInput.safeParse(input).success).toBe(true);
  expect(
    guestSessionSubmitInput.safeParse({ ...input, notes: "n".repeat(1001) })
      .success,
  ).toBe(false);
  expect(
    guestSessionSubmitInput.safeParse({ ...input, requests: "r".repeat(501) })
      .success,
  ).toBe(false);
});
