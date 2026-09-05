import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  id: vi.fn(),
  current: vi.fn(),
  claimed: vi.fn(),
  user: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: "db" }),
}));
vi.mock("@/core/booking/invitations", () => ({
  findInvitationById: mocks.id,
  findInvitationByToken: mocks.token,
}));
vi.mock("./current-guest", () => ({
  getCurrentGuestInvitation: mocks.current,
}));
vi.mock("./guest-account", () => ({ partyIsClaimedByUser: mocks.claimed }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.user } }),
}));
import { resolveGuestContactAuthority } from "./guest-contact-authority";

const invitation = {
  id: "00000000-0000-4000-8000-000000000402",
  homeId: "home",
  partyId: "party",
};
describe("guest contact authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.id.mockResolvedValue(invitation);
    mocks.token.mockResolvedValue(invitation);
    mocks.claimed.mockResolvedValue(false);
    mocks.user.mockResolvedValue({
      data: {
        user: {
          id: "user",
          email: "verified@example.com",
          email_confirmed_at: "2026-09-01",
          identities: [{ provider: "google" }],
        },
      },
    });
  });
  it("rejects account selectors for another user's party", async () => {
    expect(
      await resolveGuestContactAuthority({
        kind: "account",
        invitationId: invitation.id,
      }),
    ).toBeNull();
    expect(mocks.claimed).toHaveBeenCalledWith("party", "user");
  });
  it("rejects malformed account UUIDs before querying PostgreSQL", async () => {
    expect(
      await resolveGuestContactAuthority({
        kind: "account",
        invitationId: "-".repeat(36),
      }),
    ).toBeNull();
    expect(mocks.id).not.toHaveBeenCalled();
  });
  it("does not treat an unrelated signed-in Google address as the bearer guest's verified address", async () => {
    expect(
      await resolveGuestContactAuthority({ kind: "token", token: "live" }),
    ).toEqual({
      authority: {
        invitationId: invitation.id,
        homeId: "home",
        partyId: "party",
      },
      verifiedEmail: null,
    });
  });
  it("derives Google email for a matching claimed party", async () => {
    mocks.claimed.mockResolvedValue(true);
    expect(
      await resolveGuestContactAuthority({
        kind: "account",
        invitationId: invitation.id,
      }),
    ).toEqual({
      authority: {
        invitationId: invitation.id,
        homeId: "home",
        partyId: "party",
      },
      verifiedEmail: "verified@example.com",
    });
  });
  it("cannot open a session invitation when its return capability no longer resolves", async () => {
    mocks.current.mockResolvedValue(null);
    expect(await resolveGuestContactAuthority({ kind: "session" })).toBeNull();
    expect(mocks.id).not.toHaveBeenCalled();
  });
});
