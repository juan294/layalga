import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const access = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/server/env", () => ({
  assistantAccessOn: () => access.on,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import PrivacyPage, { generateMetadata } from "./page";

const render = async (locale: "en" | "es" = "es") =>
  renderToStaticMarkup(
    await PrivacyPage({ params: Promise.resolve({ locale }) }),
  );

// Assert the required content independently of the page's private section list.
const EXPECTED_SECTIONS = [
  "signIn",
  "household",
  "stayRequests",
  "assistant",
  "services",
  "retention",
  "choices",
] as const;

describe("privacy page", () => {
  beforeEach(() => {
    access.on = false;
  });

  it("renders every section and a way back to sign-in", async () => {
    const html = await render();

    expect(html).toContain("<h1");
    expect(html).toContain("Privacy.title");
    for (const section of EXPECTED_SECTIONS) {
      expect(html).toContain(`Privacy.${section}Title`);
      expect(html).toContain(`Privacy.${section}Body`);
    }
    expect(html).toContain('href="/es/sign-in"');
  });

  it("leaves out the assistant section and its date while assistants are off", async () => {
    const html = await render();
    expect(html).toContain("Privacy.updated<");
    expect(html).not.toContain("Privacy.updatedAssistants");
    expect(html).not.toContain("Privacy.connectedAssistants");
  });

  it("adds the assistant section after the coordinator, with its date, when assistants are on", async () => {
    access.on = true;
    const html = await render();
    expect(html).toContain("Privacy.updatedAssistants<");
    expect(html).not.toContain("Privacy.updated<");
    const order = [
      "Privacy.assistantTitle",
      "Privacy.connectedAssistantsTitle",
      "Privacy.connectedAssistantsBody",
      "Privacy.servicesTitle",
    ].map((key) => html.indexOf(key));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('href="/es/assistants"');
  });

  it("dates the assistant notice and names the limits in both languages", () => {
    for (const messages of [en, es]) {
      expect(messages.Privacy.updatedAssistants).not.toBe(
        messages.Privacy.updated,
      );
      expect(messages.Privacy.updatedAssistants).toMatch(/2026/);
    }
    // Owner decisions: what tools return, the sign-in service limit, sign-out.
    for (const fact of [
      "cannot send, change or withdraw",
      "notes",
      "sign-in service",
      "Signing out",
      "two days",
    ])
      expect(en.Privacy.connectedAssistantsBody).toContain(fact);
    for (const fact of [
      "No puede enviar, cambiar ni retirar",
      "notas",
      "servicio de inicio de sesión",
      "Cerrar sesión",
      "dos días",
    ])
      expect(es.Privacy.connectedAssistantsBody).toContain(fact);
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
    for (const section of EXPECTED_SECTIONS) {
      expect(en.Privacy).toHaveProperty(`${section}Title`);
      expect(en.Privacy).toHaveProperty(`${section}Body`);
    }
  });
});
