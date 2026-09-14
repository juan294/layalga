import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../db/client";
import {
  captureInvitation,
  extendInvitationAccessForStay,
  findInvitationById,
  findInvitationByToken,
  hashLinkToken,
  issueLinkToken,
  reissueInvitationLink,
} from "./invitations";

const homeId = "11111111-1111-4111-8111-111111111111";
const hostId = "22222222-2222-4222-8222-222222222222";
const partyId = "33333333-3333-4333-8333-333333333333";
const invitationId = "44444444-4444-4444-8444-444444444444";
const secret = "test-secret-with-enough-entropy";
const now = new Date("2026-09-13T10:00:00.000Z");

function fakeDatabase(responses: unknown[] = []) {
  const transaction = vi.fn();
  responses.forEach((response) => transaction.mockResolvedValueOnce(response));
  const database = vi.fn();
  Object.assign(database, {
    begin: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  });
  return {
    database: database as unknown as DatabaseClient,
    transaction,
  };
}

const input = {
  homeId,
  hostId,
  partyName: "The Vega family",
  partyLocale: "es" as const,
  rawMessage: "Please come in October.",
  structured: { adults: 2 },
  linkTokenExpiresAt: new Date("2026-11-01T00:00:00.000Z"),
  tokenSecret: secret,
  appUrl: "https://example.test/",
  now,
};

const invitationRow = {
  id: invitationId,
  home_id: homeId,
  host_id: hostId,
  party_id: partyId,
  family_name: "The Vega family",
  locale: "es" as const,
  raw_message: input.rawMessage,
  structured: input.structured,
  status: "tentative" as const,
  link_token_expires_at: input.linkTokenExpiresAt,
};

describe("invitation token boundaries", () => {
  it("hashes and issues opaque link tokens", () => {
    const link = issueLinkToken(secret);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(link.hash).toBe(hashLinkToken(link.token, secret));
    expect(() => hashLinkToken("", secret)).toThrow("Link token is required");
    expect(() => hashLinkToken("token", "")).toThrow("LINK_TOKEN_SECRET is required");
  });

  it("captures an invitation for an existing party and refreshes its locale", async () => {
    const fake = fakeDatabase([
      [{ id: hostId }],
      [{ id: partyId }],
      [],
      [{ id: invitationId }],
    ]);

    await expect(captureInvitation(fake.database, input)).resolves.toMatchObject({
      invitationId,
      partyId,
      guestLink: expect.stringMatching(/^https:\/\/example\.test\/es\/g\//),
    });
    expect(fake.transaction).toHaveBeenCalledTimes(4);
  });

  it("creates a new party and rejects missing persisted ids", async () => {
    const created = fakeDatabase([
      [{ id: hostId }],
      [],
      [{ id: partyId }],
      [{ id: invitationId }],
    ]);
    await expect(captureInvitation(created.database, input)).resolves.toMatchObject({
      partyId,
      invitationId,
    });

    const noParty = fakeDatabase([[{ id: hostId }], [], []]);
    await expect(captureInvitation(noParty.database, input)).rejects.toThrow(
      "Failed to create or load the invited party",
    );
    const noInvitation = fakeDatabase([[{ id: hostId }], [{ id: partyId }], [], []]);
    await expect(captureInvitation(noInvitation.database, input)).rejects.toThrow(
      "Failed to create the invitation",
    );
    const noHost = fakeDatabase([[]]);
    await expect(captureInvitation(noHost.database, input)).rejects.toThrow(
      "Host does not belong to the invitation home",
    );
  });

  it("reissues a live link and rejects a missing invitation", async () => {
    const fake = fakeDatabase([[{ party_id: partyId, locale: "en" }], []]);

    await expect(
      reissueInvitationLink(fake.database, invitationId, {
        tokenSecret: secret,
        appUrl: "https://example.test/",
        now,
      }),
    ).resolves.toMatch(/^https:\/\/example\.test\/en\/g\//);
    expect(fake.transaction).toHaveBeenCalledTimes(2);

    const missing = fakeDatabase([[]]);
    await expect(
      reissueInvitationLink(missing.database, invitationId, {
        tokenSecret: secret,
        appUrl: "https://example.test",
        now,
      }),
    ).rejects.toThrow(`Invitation not found: ${invitationId}`);
  });

  it("extends access inside the caller's transaction and maps token/id lookups", async () => {
    const extension = vi.fn();
    await extendInvitationAccessForStay(
      extension as never,
      invitationId,
      "2026-10-20",
    );
    expect(extension).toHaveBeenCalledTimes(1);

    const found = fakeDatabase();
    const sql = found.database as unknown as ReturnType<typeof vi.fn>;
    sql.mockResolvedValueOnce([invitationRow]);
    await expect(findInvitationByToken(found.database, "token", secret)).resolves.toEqual({
      id: invitationId,
      homeId,
      hostId,
      partyId,
      partyName: "The Vega family",
      partyLocale: "es",
      rawMessage: input.rawMessage,
      structured: input.structured,
      status: "tentative",
      linkTokenExpiresAt: input.linkTokenExpiresAt,
    });

    sql.mockResolvedValueOnce([]);
    await expect(findInvitationByToken(found.database, "token", secret)).resolves.toBeNull();
    sql.mockResolvedValueOnce([invitationRow]);
    await expect(findInvitationById(found.database, invitationId)).resolves.toMatchObject({
      id: invitationId,
      partyName: "The Vega family",
    });
    sql.mockResolvedValueOnce([]);
    await expect(findInvitationById(found.database, invitationId)).resolves.toBeNull();
  });
});
