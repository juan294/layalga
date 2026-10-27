import { renderToStaticMarkup } from "react-dom/server";
import english from "../../../messages/en.json";
import spanish from "../../../messages/es.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  resolve: vi.fn(),
  localized: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations:
    async ({ locale }: { locale: "en" | "es" }) =>
    (key: string) =>
      mocks.localized
        ? (
            (locale === "en" ? english : spanish).GuestEmail as Record<
              string,
              string
            >
          )[key]
        : key,
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
    mocks.localized = false;
    mocks.resolve.mockResolvedValue({
      authority: {
        invitationId: "invitation",
        homeId: "home",
        partyId: "party",
      },
      verifiedEmail: null,
    });
  });
  it.each(["en", "es"] as const)(
    "shows uncertain verification and the existing explicit consented request in %s",
    async (locale) => {
      mocks.localized = true;
      mocks.load.mockResolvedValue({
        status: "unverified",
        email: "guest@example.test",
        deliveryFailed: false,
        deliveryUnknown: true,
      });
      vi.stubEnv("EMAIL", "ses");
      try {
        const html = renderToStaticMarkup(
          await GuestEmailPreferences({
            locale,
            context: { kind: "token", token: "fixture" },
          }),
        );
        const messages = (locale === "en" ? english : spanish)
          .GuestEmail as Record<string, string>;
        expect(messages.deliveryUnknown).toMatch(
          locale === "en" ? /cannot confirm/i : /no podemos confirmar/i,
        );
        expect(html).toContain(`role="alert">${messages.deliveryUnknown}`);
        expect(html).toContain(messages.verifySend);
        expect(html).toContain('name="consent"');
        expect(html).not.toContain(messages.deliveryFailed);
        expect(html).not.toContain(messages.unverified);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

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
    mocks.load.mockResolvedValue({ status: "no_contact", email: null });
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
