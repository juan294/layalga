import { describe, expect, it } from "vitest";

import { hashLinkToken, issueLinkToken } from "./invitations";

describe("link invitation tokens", () => {
  it("issues 32 random base64url bytes and stores only an HMAC", () => {
    const secret = "test-secret-with-enough-entropy";
    const first = issueLinkToken(secret);
    const second = issueLinkToken(secret);

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.hash).not.toBe(first.token);
    expect(first.hash).toBe(hashLinkToken(first.token, secret));
    expect(second.token).not.toBe(first.token);
  });

  it("binds the stored HMAC to the configured secret", () => {
    const token = issueLinkToken("secret-a").token;

    expect(hashLinkToken(token, "secret-a")).not.toBe(
      hashLinkToken(token, "secret-b"),
    );
  });
});
