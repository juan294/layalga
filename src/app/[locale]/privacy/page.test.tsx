import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  hasLocale: (locales: readonly string[], locale: string) =>
    locales.includes(locale),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
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

import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import PrivacyPage, { generateMetadata, PRIVACY_SECTIONS } from "./page";

describe("privacy page", () => {
  it("renders every section and a way back to sign-in", async () => {
    const html = renderToStaticMarkup(
      await PrivacyPage({ params: Promise.resolve({ locale: "es" }) }),
    );

    expect(html).toContain("<h1");
    expect(html).toContain("Privacy.title");
    for (const section of PRIVACY_SECTIONS) {
      expect(html).toContain(`Privacy.${section}Title`);
      expect(html).toContain(`Privacy.${section}Body`);
    }
    expect(html).toContain('href="/es/sign-in"');
  });

  it("titles the tab with the notice title", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "en" }) }),
    ).resolves.toEqual({ title: "Privacy.title" });
  });

  it("rejects an unknown locale", async () => {
    await expect(
      PrivacyPage({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow("not found");
  });

  it("has the same privacy copy keys in English and Spanish", () => {
    expect(Object.keys(es.Privacy).sort()).toEqual(
      Object.keys(en.Privacy).sort(),
    );
    for (const section of PRIVACY_SECTIONS) {
      expect(en.Privacy).toHaveProperty(`${section}Title`);
      expect(en.Privacy).toHaveProperty(`${section}Body`);
    }
  });
});
