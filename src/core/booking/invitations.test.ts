import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { DatabaseClient } from "../db/client";

import {
  findInvitationById,
  hashLinkToken,
  issueLinkToken,
  type InvitationByToken,
} from "./invitations";

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

describe("invitation lookup", () => {
  it("models the absent expiry of an invitation without a magic link", () => {
    expectTypeOf<InvitationByToken["linkTokenExpiresAt"]>().toEqualTypeOf<
      Date | null
    >();
  });

  it("resolves a non-cancelled invitation by primary key without link checks", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: "invitation-1",
        home_id: "home-1",
        host_id: "host-1",
        party_id: "party-1",
        family_name: "The Oteros",
        locale: "es",
        raw_message: "Venid a visitarnos",
        structured: { pets: 1 },
        status: "sent",
        link_token_expires_at: null,
      },
    ]);

    await expect(
      findInvitationById(query as unknown as DatabaseClient, "invitation-1"),
    ).resolves.toEqual({
      id: "invitation-1",
      homeId: "home-1",
      hostId: "host-1",
      partyId: "party-1",
      partyName: "The Oteros",
      partyLocale: "es",
      rawMessage: "Venid a visitarnos",
      structured: { pets: 1 },
      status: "sent",
      linkTokenExpiresAt: null,
    });

    const [strings, invitationId] = query.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join("?")).toContain("where i.id = ?");
    expect(strings.join("?")).not.toContain("link_token_revoked_at");
    expect(invitationId).toBe("invitation-1");
  });

  it("returns null when the invitation ID is unavailable", async () => {
    const query = vi.fn().mockResolvedValue([]);

    await expect(
      findInvitationById(query as unknown as DatabaseClient, "missing"),
    ).resolves.toBeNull();
  });
});
