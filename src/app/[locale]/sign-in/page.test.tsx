import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
}));

vi.mock("next-intl", () => ({
  hasLocale: (locales: readonly string[], locale: string) =>
    locales.includes(locale),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: "en" | "es";
    namespace: string;
  }) =>
    (key: string, values?: { name?: string }) => {
      if (namespace === "DemoHost" && key === "enterAs") {
        return locale === "es"
          ? `Entrar como ${values?.name}`
          : `Enter as ${values?.name}`;
      }
      if (namespace === "DemoHost" && key === "enterAsGuest") {
        return locale === "es" ? "Entrar como invitado" : "Enter as Guest";
      }
      return `${namespace}.${key}`;
    },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ sql: mocks.sql }),
}));
vi.mock("@/i18n/locale-switcher", () => ({
  LocaleSwitcher: () => null,
}));
vi.mock("./postcard-art", () => ({ PostcardArt: () => null }));
vi.mock("./sign-in-button", () => ({
  SignInButton: () => <button data-testid="google-sign-in">Google</button>,
}));

import SignInPage from "./page";

describe("sign-in page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMO_MODE", "true");
    mocks.sql
      .mockResolvedValueOnce([
        {
          id: "00000000-0000-4000-8000-000000000801",
          display_name: "Juan González",
        },
      ])
      .mockResolvedValueOnce([
        { invitation_id: "00000000-0000-4000-8000-000000000802" },
      ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders exactly the host and guest entries in demo mode", async () => {
    const html = await renderPage("en");

    expect(html.match(/data-testid="demo-enter-/g)).toHaveLength(2);
    expect(html).toContain('data-testid="demo-enter-host"');
    expect(html).toContain('data-testid="demo-enter-guest"');
    expect(html).not.toContain('data-testid="google-sign-in"');
    expect(html).toContain("Enter as Juan González");
    expect(html).toContain("Enter as Guest");

    const guestQuery = mocks.sql.mock.calls[1]?.[0] as
      | TemplateStringsArray
      | undefined;
    expect(guestQuery?.join(" ")).toContain(
      "invitation.status <> 'cancelled'",
    );
    expect(guestQuery?.join(" ")).not.toContain("party.family_name");
  });

  it("renders only Google sign-in outside demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "false");

    const html = await renderPage("en");

    expect(html).toContain('data-testid="google-sign-in"');
    expect(html).not.toContain('data-testid="demo-enter-host"');
    expect(html).not.toContain('data-testid="demo-enter-guest"');
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("renders the Spanish guest label", async () => {
    const html = await renderPage("es");

    expect(html).toContain("Entrar como invitado");
  });
});

async function renderPage(locale: "en" | "es") {
  const page = await SignInPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(page);
}
