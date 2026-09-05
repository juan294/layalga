import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getCookie: vi.fn(),
  sql: vi.fn(),
  resolveReturn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ sql: mocks.sql }),
}));

vi.mock("@/core/notifications/guest-contact", () => ({
  resolveGuestReturnCapability: mocks.resolveReturn,
}));

import { GUEST_EMAIL_COOKIE } from "./guest-email-session";
import { createDemoGuestCookie, DEMO_GUEST_COOKIE } from "./demo-session";
import { getCurrentGuestInvitation } from "./current-guest";

const secret = "a-secure-demo-session-secret-with-32-bytes";
const invitationId = "00000000-0000-4000-8000-000000000402";

describe("getCurrentGuestInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DEMO_SESSION_SECRET", secret);
    mocks.cookies.mockResolvedValue({ get: mocks.getCookie });
    mocks.sql.mockResolvedValue([]);
    mocks.resolveReturn.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null outside demo mode even with a valid cookie", async () => {
    const token = createDemoGuestCookie(invitationId, { secret });
    mocks.getCookie.mockImplementation((name: string) =>
      name === DEMO_GUEST_COOKIE ? { value: token } : undefined,
    );
    vi.stubEnv("DEMO_MODE", "false");

    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    expect(mocks.cookies).toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("revalidates a real return capability on every request outside demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    mocks.getCookie.mockImplementation((name: string) =>
      name === GUEST_EMAIL_COOKIE ? { value: "signed-return" } : undefined,
    );
    mocks.resolveReturn
      .mockResolvedValueOnce({
        invitationId,
        homeId: "home",
        partyId: "party",
        locale: "es",
        expiresAt: "2026-10-01T00:00:00Z",
      })
      .mockResolvedValueOnce(null);
    await expect(getCurrentGuestInvitation()).resolves.toEqual({
      invitationId,
      homeId: "home",
      partyId: "party",
      partyLocale: "es",
    });
    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    expect(mocks.resolveReturn).toHaveBeenCalledTimes(2);
  });

  it("returns null when the guest cookie is absent", async () => {
    mocks.getCookie.mockReturnValue(undefined);

    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    expect(mocks.getCookie).toHaveBeenCalledWith(DEMO_GUEST_COOKIE);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("does not fall back to a demo identity after a real capability is revoked", async () => {
    const demo = createDemoGuestCookie(invitationId, { secret });
    mocks.getCookie.mockImplementation((name: string) => ({
      value: name === GUEST_EMAIL_COOKIE ? "revoked-return" : demo,
    }));
    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("returns null when the invitation does not belong to a demo home", async () => {
    const token = createDemoGuestCookie(invitationId, { secret });
    mocks.getCookie.mockImplementation((name: string) =>
      name === DEMO_GUEST_COOKIE ? { value: token } : undefined,
    );
    mocks.sql.mockResolvedValue([]);

    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    expect(mocks.sql).toHaveBeenCalledWith(expect.any(Array), invitationId);
    const query = mocks.sql.mock.calls[0]?.[0] as
      TemplateStringsArray | undefined;
    expect(query?.join(" ")).toContain("home.demo = true");
  });

  it("does not resolve a cancelled invitation", async () => {
    const token = createDemoGuestCookie(invitationId, { secret });
    mocks.getCookie.mockImplementation((name: string) =>
      name === DEMO_GUEST_COOKIE ? { value: token } : undefined,
    );

    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    const query = mocks.sql.mock.calls[0]?.[0] as
      TemplateStringsArray | undefined;
    expect(query?.join(" ")).toContain("invitation.status <> 'cancelled'");
  });

  it("returns the invitation identity for a valid demo guest", async () => {
    const token = createDemoGuestCookie(invitationId, { secret });
    mocks.getCookie.mockImplementation((name: string) =>
      name === DEMO_GUEST_COOKIE ? { value: token } : undefined,
    );
    mocks.sql.mockResolvedValue([
      {
        home_id: "00000000-0000-4000-8000-000000000101",
        party_id: "00000000-0000-4000-8000-000000000302",
        locale: "es",
      },
    ]);

    await expect(getCurrentGuestInvitation()).resolves.toEqual({
      invitationId,
      homeId: "00000000-0000-4000-8000-000000000101",
      partyId: "00000000-0000-4000-8000-000000000302",
      partyLocale: "es",
    });
  });
});
