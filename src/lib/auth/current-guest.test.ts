import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getCookie: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ sql: mocks.sql }),
}));

import {
  createDemoGuestCookie,
  DEMO_GUEST_COOKIE,
} from "./demo-session";
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null outside demo mode even with a valid cookie", async () => {
    const token = createDemoGuestCookie(invitationId, { secret });
    mocks.getCookie.mockReturnValue({
      name: DEMO_GUEST_COOKIE,
      value: token,
    });
    vi.stubEnv("DEMO_MODE", "false");

    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("returns null when the guest cookie is absent", async () => {
    mocks.getCookie.mockReturnValue(undefined);

    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    expect(mocks.getCookie).toHaveBeenCalledWith(DEMO_GUEST_COOKIE);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("returns null when the invitation does not belong to a demo home", async () => {
    const token = createDemoGuestCookie(invitationId, { secret });
    mocks.getCookie.mockReturnValue({
      name: DEMO_GUEST_COOKIE,
      value: token,
    });
    mocks.sql.mockResolvedValue([]);

    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    expect(mocks.sql).toHaveBeenCalledWith(expect.any(Array), invitationId);
    const query = mocks.sql.mock.calls[0]?.[0] as
      | TemplateStringsArray
      | undefined;
    expect(query?.join(" ")).toContain("home.demo = true");
  });

  it("does not resolve a cancelled invitation", async () => {
    const token = createDemoGuestCookie(invitationId, { secret });
    mocks.getCookie.mockReturnValue({
      name: DEMO_GUEST_COOKIE,
      value: token,
    });

    await expect(getCurrentGuestInvitation()).resolves.toBeNull();
    const query = mocks.sql.mock.calls[0]?.[0] as
      | TemplateStringsArray
      | undefined;
    expect(query?.join(" ")).toContain("invitation.status <> 'cancelled'");
  });

  it("returns the invitation identity for a valid demo guest", async () => {
    const token = createDemoGuestCookie(invitationId, { secret });
    mocks.getCookie.mockReturnValue({
      name: DEMO_GUEST_COOKIE,
      value: token,
    });
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
