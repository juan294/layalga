import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { webSession } from "@/test-support/web-session";

import en from "../../../../../messages/en.json";
import es from "../../../../../messages/es.json";

const ID = "6qozma2yk5o6zzzh6t7ozzpowz2l4h5t";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  host: false,
  oauth: vi.fn(),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } =
    await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    setRequestLocale: vi.fn(),
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: "en" | "es";
      namespace: "Assistants";
    }) =>
      createTranslator({
        locale,
        messages: locale === "es" ? es : en,
        namespace,
      }),
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      ...webSession(mocks.getUser).auth,
      oauth: {
        getAuthorizationDetails: mocks.oauth,
        approveAuthorization: mocks.oauth,
        denyAuthorization: mocks.oauth,
      },
    },
  }),
}));
vi.mock("@/core/db/client", () => ({
  sqlClient: (database: unknown) => database,
  getDatabaseConnection: () => ({ db: async () => [{ host: mocks.host }] }),
}));
vi.mock("./actions", () => ({
  continueAssistantConsent: mocks.oauth,
  decideAssistantAccess: mocks.oauth,
}));

import ConsentPage, { metadata } from "./page";

const user = {
  id: "user-1",
  email: "guest@example.com",
  email_confirmed_at: "2030-01-01",
  identities: [{ provider: "google" }],
};

async function render(
  query: Record<string, string | string[]> = { authorization_id: ID },
  locale: "en" | "es" = "en",
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
      timeZone="UTC"
    >
      {await ConsentPage({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve(query),
      })}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("ASSISTANT_ACCESS", "on");
  mocks.host = false;
  mocks.getUser.mockResolvedValue({ data: { user } });
});

describe("assistant consent page", () => {
  it("shows the account and the warning, and reads nothing from Auth about the request", async () => {
    const html = await render();
    expect(html).toContain("guest@example.com");
    expect(html).toContain(en.Assistants.states.start.body);
    expect(html).toContain(en.Assistants.continue);
    expect(html).toContain(en.Assistants.useAnother);
    expect(html).not.toContain(en.Assistants.allow + "<");
    expect(mocks.oauth).not.toHaveBeenCalled();
  });

  it.each(["en", "es"] as const)(
    "explains that approval needs JavaScript (%s)",
    async (locale) => {
      const messages = locale === "es" ? es : en;
      expect(await render(undefined, locale)).toContain(
        `<noscript><p>${messages.Assistants.noScript}</p></noscript>`,
      );
    },
  );

  it("offers the same request again after a failed sign-in", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const html = await render({ authorization_id: ID, auth: "failed" });
    expect(html).toContain(en.Assistants.states.sign_in.title);
    expect(html).toContain(en.Assistants.authFailed);
    expect(html).toContain(en.Assistants.signIn);
    expect(mocks.oauth).not.toHaveBeenCalled();
  });

  it.each([
    [
      "off",
      (): void => {
        vi.stubEnv("ASSISTANT_ACCESS", "none");
      },
    ],
    [
      "host",
      (): void => {
        mocks.host = true;
      },
    ],
  ] as const)(
    "shows %s without reading the request",
    async (status, change) => {
      change();
      const html = await render();
      expect(html).toContain(en.Assistants.states[status].title);
      expect(html).toContain(en.Assistants.states[status].body);
      expect(html).not.toContain(en.Assistants.continue + "<");
      expect(mocks.oauth).not.toHaveBeenCalled();
    },
  );

  it("links to the assistants page while connections are off, also without a session", async () => {
    vi.stubEnv("ASSISTANT_ACCESS", "none");
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await render(undefined, "es")).toContain('href="/es/assistants"');
  });

  it.each([
    {},
    { authorization_id: "short" },
    { authorization_id: [ID, ID] },
    { authorization_id: `${ID}/x` },
  ])("calls an incomplete link invalid: %j", async (query) => {
    const html = await render(query as Record<string, string>);
    expect(html).toContain(en.Assistants.states.invalid.title);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("keeps the address out of search engines and referrers", () => {
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
      referrer: "same-origin",
    });
  });
});
