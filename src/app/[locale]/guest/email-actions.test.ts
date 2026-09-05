import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  register: vi.fn(),
  disable: vi.fn(),
  verify: vi.fn(),
  session: vi.fn(),
  deleteCookie: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: mocks.deleteCookie }),
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: "db" }),
}));
vi.mock("@/lib/auth/guest-contact-authority", () => ({
  resolveGuestContactAuthority: mocks.resolve,
}));
vi.mock("@/lib/auth/guest-email-session", () => ({
  GUEST_EMAIL_COOKIE: "email-cookie",
  setGuestEmailSession: mocks.session,
}));
vi.mock("@/core/notifications/guest-contact", () => ({
  registerGuestContact: mocks.register,
  disableGuestContact: mocks.disable,
  verifyGuestContact: mocks.verify,
  GuestContactError: class extends Error {},
}));

import { confirmGuestEmail, saveGuestEmail } from "./email-actions";

const authority = {
  invitationId: "invitation",
  homeId: "canonical-home",
  partyId: "canonical-party",
};
describe("guest email actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({
      authority,
      verifiedEmail: "verified@example.com",
    });
    mocks.register.mockResolvedValue({
      status: "enabled",
      email: "verified@example.com",
    });
    mocks.disable.mockResolvedValue({ status: "disabled", email: null });
  });
  it("requires explicit consent and does not enroll on a blank form", async () => {
    await expect(
      saveGuestEmail({ kind: "session" }, "en", new FormData()),
    ).rejects.toThrow("email=invalid");
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("uses verified server Google address and canonical scope despite posted forgery", async () => {
    const form = new FormData();
    form.set("consent", "on");
    form.set("addressSource", "google");
    form.set("email", "attacker@example.com");
    form.set("homeId", "other-home");
    form.set("partyId", "other-party");
    await expect(
      saveGuestEmail(
        { kind: "account", invitationId: "invitation" },
        "en",
        form,
      ),
    ).rejects.toThrow("email=enabled");
    expect(mocks.register).toHaveBeenCalledWith(
      "db",
      {
        ...authority,
        email: "verified@example.com",
        locale: "en",
        consent: true,
        verifiedGoogle: true,
      },
      expect.anything(),
    );
  });
  it("rejects a claimed Google path without verified ownership", async () => {
    mocks.resolve.mockResolvedValue({ authority, verifiedEmail: null });
    const form = new FormData();
    form.set("consent", "on");
    form.set("addressSource", "google");
    form.set("email", "attacker@example.com");
    await expect(
      saveGuestEmail({ kind: "token", token: "bearer" }, "es", form),
    ).rejects.toThrow("email=invalid");
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("uses typed address only as unverified enrollment", async () => {
    const form = new FormData();
    form.set("consent", "on");
    form.set("email", "typed@example.com");
    form.set("verifiedGoogle", "true");
    await expect(
      saveGuestEmail({ kind: "token", token: "bearer" }, "en", form),
    ).rejects.toThrow("redirect:");
    expect(mocks.register).toHaveBeenCalledWith(
      "db",
      expect.objectContaining({
        email: "typed@example.com",
        verifiedGoogle: false,
      }),
      expect.anything(),
    );
  });
  it("clears revoked email session on explicit opt-out", async () => {
    const form = new FormData();
    form.set("operation", "disable");
    await expect(
      saveGuestEmail({ kind: "session" }, "en", form),
    ).rejects.toThrow("redirect:/en/guest/email-status");
    expect(mocks.disable).toHaveBeenCalledWith(
      "db",
      authority,
      expect.anything(),
    );
    expect(mocks.deleteCookie).toHaveBeenCalledWith("email-cookie");
  });
  it("shows check-email recovery after an address update revokes the old session generation", async () => {
    mocks.register.mockResolvedValue({
      status: "unverified",
      email: "new@example.com",
    });
    const form = new FormData();
    form.set("email", "new@example.com");
    form.set("consent", "on");
    await expect(
      saveGuestEmail({ kind: "session" }, "en", form),
    ).rejects.toThrow("redirect:/en/guest/email-status?state=unverified");
    expect(mocks.deleteCookie).toHaveBeenCalledWith("email-cookie");
  });
  it("rejects invalid/replayed verification without establishing a session", async () => {
    mocks.verify.mockResolvedValue(null);
    const form = new FormData();
    form.set("capability", "expired");
    await expect(confirmGuestEmail("es", form)).rejects.toThrow(
      "redirect:/es/guest/verify?invalid=1",
    );
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("POST verification establishes a session and never reconfirms a booking", async () => {
    mocks.verify.mockResolvedValue({
      capability: "return-capability",
      locale: "es",
    });
    mocks.session.mockResolvedValue(authority);
    const form = new FormData();
    form.set("capability", "verification");
    await expect(confirmGuestEmail("en", form)).rejects.toThrow(
      "redirect:/es/guest?email=enabled",
    );
    expect(mocks.session).toHaveBeenCalledWith("return-capability");
    expect(mocks.register).not.toHaveBeenCalled();
  });
});
