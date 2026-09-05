import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: "db" }),
}));
vi.mock("@/app/[locale]/guest/email-actions", () => ({
  saveGuestEmail: vi.fn(),
}));
vi.mock("@/lib/auth/guest-contact-authority", () => ({
  resolveGuestContactAuthority: mocks.resolve,
}));
vi.mock("@/core/notifications/guest-contact", () => ({
  loadGuestContact: mocks.load,
  GuestContactError: class extends Error {},
}));
import { GuestContactError } from "@/core/notifications/guest-contact";
import {
  GuestEmailPreferences,
  AuthorizedGuestEmailPreferences,
} from "./guest-email-preferences";
describe("guest email preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({
      authority: {
        invitationId: "invitation",
        homeId: "home",
        partyId: "party",
      },
      verifiedEmail: null,
    });
  });
  it("renders a safe unavailable notice for expired or revoked account invitation history", async () => {
    mocks.load.mockRejectedValue(new GuestContactError("unavailable"));
    const html = renderToStaticMarkup(
      await GuestEmailPreferences({
        locale: "en",
        context: { kind: "account", invitationId: "invitation" },
      }),
    );
    expect(html).toContain("unavailable");
    expect(html).not.toContain("<form");
  });
  it("clearly labels demo delivery and offers no address collection", async () => {
    mocks.load.mockResolvedValue({ status: "demo", email: null });
    const html = renderToStaticMarkup(
      await GuestEmailPreferences({
        locale: "es",
        context: { kind: "session" },
      }),
    );
    expect(html).toContain("demo");
    expect(html).not.toContain('name="email"');
  });
  it("shows a failed-send notice without treating it as guest silence", async () => {
    mocks.load.mockResolvedValue({
      status: "no_contact",
      email: null,
      deliveryFailed: true,
    });
    const html = renderToStaticMarkup(
      await GuestEmailPreferences({
        locale: "en",
        context: { kind: "session" },
      }),
    );
    expect(html).toContain('role="alert">deliveryFailed');
  });
  it("reuses an account page's owned read context without another identity lookup", async () => {
    mocks.load.mockResolvedValue({ status: "demo", email: null });
    const authority = {
      invitationId: "owned-invitation",
      homeId: "owned-home",
      partyId: "owned-party",
    };
    const html = renderToStaticMarkup(
      await AuthorizedGuestEmailPreferences({
        locale: "en",
        context: { kind: "account", invitationId: authority.invitationId },
        resolved: { authority, verifiedEmail: "verified@example.com" },
      }),
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledWith("db", authority);
    expect(html).toContain("guest-email-owned-invitation");
  });
});
