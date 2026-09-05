import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set, delete: mocks.remove }),
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: "db" }),
}));
vi.mock("@/core/notifications/guest-contact", () => ({
  resolveGuestReturnCapability: mocks.resolve,
}));
import {
  GUEST_EMAIL_COOKIE,
  setGuestEmailSession,
} from "./guest-email-session";
import { DEMO_GUEST_COOKIE } from "./demo-session";
describe("guest email session exchange", () => {
  beforeEach(() => vi.clearAllMocks());
  it("stores only the validated capability until its original expiry and clears demo identity", async () => {
    const authority = {
      invitationId: "invitation",
      homeId: "home",
      partyId: "party",
      locale: "en",
      expiresAt: "2026-10-01T00:00:00.000Z",
    };
    mocks.resolve.mockResolvedValue(authority);
    expect(await setGuestEmailSession("signed-return")).toEqual(authority);
    expect(mocks.set).toHaveBeenCalledWith(
      GUEST_EMAIL_COOKIE,
      "signed-return",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: new Date(authority.expiresAt),
      }),
    );
    expect(mocks.remove).toHaveBeenCalledWith(DEMO_GUEST_COOKIE);
  });
  it("cannot turn an expired or revoked capability into a session", async () => {
    mocks.resolve.mockResolvedValue(null);
    expect(await setGuestEmailSession("expired")).toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
