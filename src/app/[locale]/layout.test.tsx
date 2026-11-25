import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import { googleUser as guest } from "@/test-support/web-session";

import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ user: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("../globals.css", () => ({}));
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font" });
  return { Fraunces: font, Inter: font, JetBrains_Mono: font };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl", async (original) => ({
  ...(await original<typeof import("next-intl")>()),
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("next-intl/server", () => ({
  getMessages: async () => en,
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/components/season-sync", () => ({ SeasonSync: () => null }));
vi.mock("@/components/theme-switcher", () => ({ ThemeSwitcher: () => null }));
vi.mock("@/i18n/locale-switcher", () => ({ LocaleSwitcher: () => null }));
vi.mock("@/lib/auth/current-host", () => ({
  getCurrentHost: async () => null,
}));
vi.mock("@/lib/auth/current-guest", () => ({
  getCurrentGuestInvitation: async () => null,
}));
vi.mock("@/lib/auth/current-user", () => ({
  getAuthUser: async () => mocks.user,
  getCurrentAccount: async () => null,
}));
vi.mock("@/core/booking/stay-requests", () => ({
  hasRequesterStayRequests: async () => false,
}));

import LocaleLayout from "./layout";

async function render() {
  return renderToStaticMarkup(
    await LocaleLayout({
      children: null,
      params: Promise.resolve({ locale: "es" }),
    }),
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
  mocks.user = guest;
});

it.each([
  ["on", true],
  ["none", false],
  ["", false],
])(
  "links to connected assistants only while the feature is on: %j",
  async (mode, shown) => {
    vi.stubEnv("ASSISTANT_ACCESS", mode);
    const html = await render();
    expect(html).toContain('href="/es/stays"');
    expect(html.includes('href="/es/assistants"')).toBe(shown);
  },
);

it("does not link to connected assistants without a Google account", async () => {
  vi.stubEnv("ASSISTANT_ACCESS", "on");
  mocks.user = { ...guest, identities: [{ provider: "email" }] };
  expect(await render()).not.toContain("/assistants");
});
