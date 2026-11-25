import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ConsentState } from "@/lib/auth/assistant-consent";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

vi.mock("@/app/[locale]/oauth/consent/actions", () => ({
  continueAssistantConsent: vi.fn(),
  decideAssistantAccess: vi.fn(),
}));

import { AssistantConsent } from "./assistant-consent";

const ID = "6qozma2yk5o6zzzh6t7ozzpowz2l4h5t";
const URL_ = "https://claude.ai/api/mcp/auth_callback?code=c&state=s";

function render(initial: ConsentState, locale: "en" | "es" = "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
      timeZone="UTC"
    >
      <AssistantConsent
        locale={locale}
        authorizationId={ID}
        initial={initial}
        authFailed={false}
      />
    </NextIntlClientProvider>,
  );
}

const review = (
  over: Partial<Extract<ConsentState, { status: "review" }>> = {},
): ConsentState => ({
  status: "review",
  email: "guest@example.com",
  assistant: "claude",
  domain: "claude.ai",
  scopes: [],
  ...over,
});

const count = (html: string, pattern: RegExp) =>
  html.match(pattern)?.length ?? 0;

describe("assistant consent view", () => {
  it.each([
    ["claude", "Claude", "Anthropic"],
    ["chatgpt", "ChatGPT", "OpenAI"],
  ] as const)(
    "tells who asks, where the answers go and what they can do: %s",
    (assistant, name, vendor) => {
      for (const [locale, messages] of [
        ["en", en.Assistants],
        ["es", es.Assistants],
      ] as const) {
        const html = render(review({ assistant }), locale);
        for (const text of [
          name,
          "claude.ai",
          "guest@example.com",
          messages.readHouseholds,
          messages.readDates,
          messages.readRooms,
          messages.readStatus,
          messages.cannotSend,
          messages.vendorReads.replaceAll("{vendor}", vendor),
          messages.signOutKeeps.replace("{assistant}", name),
          messages.allow,
          messages.deny,
        ])
          expect(html).toContain(text);
        expect(html).toContain(`href="/${locale}/assistants"`);
        expect(html).not.toContain(messages.alsoAsks);
      }
    },
  );

  it("gives both decisions the same weight", () => {
    const classes = [
      ...render(review()).matchAll(
        /<button[^>]*class="([^"]*)"[^>]*data-testid="assistant-(?:allow|deny)"/g,
      ),
    ].map((match) => match[1]);
    expect(classes).toHaveLength(2);
    expect(classes[0]).toBe(classes[1]);
  });

  it("lists extra scopes in plain words and an unknown one by its name", () => {
    const html = render(
      review({ scopes: ["email", "profile", "phone", "<b>x"] }),
    );
    expect(html).toContain(en.Assistants.alsoAsks);
    expect(html).toContain(en.Assistants.scope.email);
    expect(html).toContain(en.Assistants.scope.profile);
    expect(html).toContain(en.Assistants.scope.phone);
    expect(html).toContain("&lt;b&gt;x");
    expect(html).not.toContain("<b>x");
  });

  it("does not accept a click before the page is interactive", () => {
    for (const state of [
      review(),
      { status: "start", email: "guest@example.com" } as const,
    ])
      expect(
        render(state).match(
          /<button[^>]*data-testid="assistant-[a-z]+"[^>]*>/g,
        ),
      ).toSatisfy(
        (buttons: string[]) =>
          buttons.length > 0 &&
          buttons.every((button) => button.includes('disabled=""')),
      );
  });

  it.each(["continue", "redirect"] as const)(
    "shows the assistant's address only as a link: %s",
    (status) => {
      const html = render({
        status,
        email: "guest@example.com",
        assistant: "claude",
        url: URL_,
      });
      expect(html).toContain(`href="${URL_.replace("&", "&amp;")}"`);
      expect(count(html, /<a /g)).toBe(1);
      expect(html).toContain("Claude");
      expect(html).toContain("guest@example.com");
    },
  );

  // Every refusal has its own text, one next action at most, and no address of an assistant.
  it.each([
    ["off", 'href="/en/assistants"'],
    ["not_allowed", 'href="/en/stays"'],
    ["unavailable", `href="/en/oauth/consent?authorization_id=${ID}"`],
    ["host", "google-sign-in"],
    ["sign_in", "google-sign-in"],
    ["ended", null],
    ["invalid", null],
  ] as const)("gives %s its own text and next action", (status, action) => {
    for (const locale of ["en", "es"] as const) {
      const messages = locale === "es" ? es : en;
      const html = render({ status }, locale);
      expect(html).toContain(messages.Assistants.states[status].title);
      expect(html).toContain(messages.Assistants.states[status].body);
      expect(count(html, /<(?:a|button) /g)).toBe(action ? 1 : 0);
      if (action) expect(html).toContain(action.replace("/en/", `/${locale}/`));
      expect(html).not.toContain("claude.ai");
      // The sign-in button renders its own paragraph after an error.
      expect(html).not.toMatch(/<p>(?:(?!<\/p>).)*<button/);
    }
  });

  it.each([
    ["English", en],
    ["Spanish", es],
  ])("has a different text for every state in %s", (_, messages) => {
    const states = Object.values(messages.Assistants.states);
    for (const texts of [
      states.map(({ title }) => title),
      states.flatMap((state) => ("body" in state ? [state.body] : [])),
    ])
      expect(new Set(texts).size).toBe(texts.length);
  });
});
