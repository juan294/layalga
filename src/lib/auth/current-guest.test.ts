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
import { getCurrentGuestInvitation } from "./current-guest";

const invitationId = "00000000-0000-4000-8000-000000000402";

describe("getCurrentGuestInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ get: mocks.getCookie });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("revalidates a real return capability on every request", async () => {
    mocks.getCookie.mockImplementation((name: string) =>
      name === GUEST_EMAIL_COOKIE ? { value: "signed-return" } : undefined,
    );
    mocks.resolveReturn
      .mockResolvedValueOnce({
        invitationId,
        homeId: "home",
        partyId: "party",
        locale: "es",
        expiresAt: "2099-10-01T00:00:00Z",
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

  it("returns null when the guest email cookie is absent", async () => {
    mocks.getCookie.mockReturnValue(undefined);

    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    expect(mocks.resolveReturn).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("ignores a leftover demo guest cookie", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.getCookie.mockImplementation((name: string) =>
      name === "layalga_demo_guest" ? { value: "v1.payload.signature" } : undefined,
    );

    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
