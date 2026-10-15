import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  SignInButton: () => <button data-testid="google-sign-in">Google</button>,
}));

import SignInPage from "./page";

describe("sign-in page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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

async function renderPage(locale: "en" | "es", error?: string) {
  const page = await SignInPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(error ? { error } : {}),
  });
  return renderToStaticMarkup(page);
}
