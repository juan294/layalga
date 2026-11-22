import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getAuthUser, getCurrentHost, hasPartyForUser } = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getCurrentHost: vi.fn(),
  hasPartyForUser: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ getAuthUser }));
vi.mock("@/lib/auth/current-host", () => ({ getCurrentHost }));
vi.mock("@/lib/auth/guest-account", () => ({ hasPartyForUser }));
vi.mock("next-intl", () => ({
  hasLocale: (locales: readonly string[], locale: string) =>
    locales.includes(locale),
}));
vi.mock("next-intl/server", () => ({
  getTranslations:
    async ({ namespace }: { locale: "en" | "es"; namespace: string }) =>
    (key: string) =>
      `${namespace}.${key}`,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error("redirect " + path);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/i18n/locale-switcher", () => ({
  LocaleSwitcher: () => null,
}));
vi.mock("@/components/theme-switcher", () => ({
  ThemeSwitcher: () => null,
}));
vi.mock("./postcard-art", () => ({ PostcardArt: () => null }));
vi.mock("./sign-in-button", () => ({
  SignInButton: ({ nextPath }: { nextPath?: string }) => (
    <button data-testid="google-sign-in" data-next={nextPath}>
      Google
    </button>
  ),
}));

import SignInPage from "./page";

describe("sign-in page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("renders Google sign-in and no demo entry", async () => {
    const html = await renderPage("en");

    expect(html).toContain('data-testid="google-sign-in"');
    expect(html).not.toContain("demo-enter");
    expect(html).not.toContain('role="alert"');
  });

  it("renders Google sign-in even when DEMO_MODE is still set", async () => {
    vi.stubEnv("DEMO_MODE", "true");

    const html = await renderPage("en");

    expect(html).toContain('data-testid="google-sign-in"');
    expect(html).not.toContain("demo-enter");
  });

  it("keeps booking links behind Google sign-in", async () => {
    const html = await renderPage("es");
    expect(html).not.toContain('href="/es/stays"');
    expect(html).not.toContain('href="/es/requests"');
  });

  it("takes a signed-in Google guest to the directory", async () => {
    getAuthUser.mockResolvedValue({
      id: "a",
      email: "guest@example.test",
      email_confirmed_at: "2030-01-01",
      identities: [{ provider: "google" }],
    });
    await expect(renderPage("en")).rejects.toThrow("redirect /en/stays");
  });

  it.each([
    "/es/stays?q=Pe%C3%B1a",
    "/es/stays/eab9e960-0b40-4f02-8fa8-6df08829cb96?nights=14",
  ])("retains the booking search for Google: %s", async (next) => {
    expect(await renderPage("es", undefined, next)).toContain(
      `data-next="${next}"`,
    );
  });

  it.each([
    "https://other.example",
    "/en/stays",
    "/es/stays?q=home&next=/en",
    "/es/rooms",
    ["/es/stays", "/en/stays"],
  ])(
    "falls back to the locale home for an invalid booking destination: %s",
    async (next) => {
      expect(await renderPage("es", undefined, next)).not.toContain(
        "data-next=",
      );
    },
  );

  it("links to the privacy notice", async () => {
    const html = await renderPage("es");

    expect(html).toContain('href="/es/privacy"');
    expect(html).toContain("SignIn.privacyLink");
  });

  it("shows the not-a-host error next to the Google button", async () => {
    const html = await renderPage("en", "not_a_host");

    expect(html).toContain('data-testid="google-sign-in"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("SignIn.notHostError");
  });

  it("shows the callback error for a failed OAuth exchange", async () => {
    const html = await renderPage("es", "oauth_failed");

    expect(html).toContain('data-testid="google-sign-in"');
    expect(html).toContain("SignIn.callbackError");
  });
});

async function renderPage(
  locale: "en" | "es",
  error?: string,
  next?: string | string[],
) {
  const page = await SignInPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve({ error, next }),
  });
  return renderToStaticMarkup(page);
}
