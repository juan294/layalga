import { describe, expect, it } from "vitest";
import { verifiedGoogleGuestEmail } from "./verified-guest-email";

describe("verifiedGoogleGuestEmail", () => {
  it("uses the server-verified address for a Google identity", () => {
    expect(
      verifiedGoogleGuestEmail({
        email: "guest@example.com",
        email_confirmed_at: "2026-09-01",
        identities: [{ provider: "google" }],
      }),
    ).toBe("guest@example.com");
  });
  it("rejects mutable metadata claims, unconfirmed addresses and other providers", () => {
    expect(
      verifiedGoogleGuestEmail({
        email: "guest@example.com",
        user_metadata: { email_verified: true },
        identities: [{ provider: "google" }],
      }),
    ).toBeNull();
    expect(
      verifiedGoogleGuestEmail({
        email: "guest@example.com",
        email_confirmed_at: "2026-09-01",
        identities: [{ provider: "email" }],
      }),
    ).toBeNull();
    expect(verifiedGoogleGuestEmail(null)).toBeNull();
  });
});
