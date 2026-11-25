import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { webSession } from "@/test-support/web-session";

import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";

const KNOWN = "5b88d492-348d-4f5a-8c00-55a8dfe0aee4";
const OTHER = "00000000-0000-4000-8000-000000000009";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  listGrants: vi.fn(),
  rows: vi.fn(),
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
      oauth: { listGrants: mocks.listGrants },
    },
  }),
}));
vi.mock("@/core/db/client", () => ({
  sqlClient: (database: unknown) => database,
  getDatabaseConnection: () => ({ db: async () => mocks.rows() }),
}));
vi.mock("./actions", () => ({ disconnect: vi.fn() }));

import AssistantsPage from "./page";

const user = {
  id: "user-1",
  email: "guest@example.com",
  email_confirmed_at: "2030-01-01",
  identities: [{ provider: "google" }],
};
const grant = (id: string, name: string) => ({
  client: { id, name },
  scopes: ["openid"],
  granted_at: "2026-11-25T23:44:08.553565Z",
});

async function render(
  locale: "en" | "es" = "en",
  query: Record<string, string> = {},
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
      timeZone="UTC"
    >
      {await AssistantsPage({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve(query),
      })}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getUser.mockResolvedValue({ data: { user } });
  mocks.rows.mockResolvedValue([
    {
      clientId: KNOWN,
      assistant: "claude",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      enabled: false,
    },
  ]);
  mocks.listGrants.mockResolvedValue({
    data: [grant(KNOWN, "Self-asserted name"), grant(OTHER, "Claude <b>")],
    error: null,
  });
});

describe("connected assistants page", () => {
  it.each(["none", "on"])(
    "lists the connections with ASSISTANT_ACCESS=%s",
    async (mode) => {
      vi.stubEnv("ASSISTANT_ACCESS", mode);
      const html = await render();
      expect(html).toContain("Claude</");
      expect(html).not.toContain("Self-asserted name");
      expect(html).toContain("Claude &lt;b&gt;");
      expect(html).toContain(en.Assistants.list.unrecognized);
      expect(html.match(/data-testid="assistant-disconnect"/g)).toHaveLength(2);
      expect(html).toContain(`value="${KNOWN}"`);
    },
  );

  it.each([
    ["en", "Nov 25, 2026"],
    ["es", "25 nov 2026"],
  ] as const)(
    "shows the connection date and the notes (%s)",
    async (locale, date) => {
      const html = await render(locale);
      const { list } = (locale === "es" ? es : en).Assistants;
      expect(html).toContain(`${list.connectedOn} <time`);
      expect(html).toContain(`>${date}</time>`);
      for (const note of [
        list.noteAtOnce,
        list.noteSignOut,
        list.noteStale,
        list.noteClaudeCode,
      ])
        expect(html).toContain(note);
    },
  );

  it("says when nothing is connected", async () => {
    mocks.listGrants.mockResolvedValue({ data: [], error: null });
    const html = await render();
    expect(html).toContain(en.Assistants.list.empty);
    expect(html).not.toContain("assistant-disconnect");
  });

  it.each([
    ["a missing session", { data: { user: null } }],
    [
      "another provider",
      { data: { user: { ...user, identities: [{ provider: "email" }] } } },
    ],
  ])(
    "asks for Google sign-in with %s and lists nothing",
    async (_, session) => {
      mocks.getUser.mockResolvedValue(session);
      const html = await render("en", { auth: "failed" });
      expect(html).toContain("google-sign-in");
      expect(html).toContain(en.Assistants.authFailed);
      expect(mocks.listGrants).not.toHaveBeenCalled();
    },
  );

  it("says that assistants cannot use the connections while the OAuth server is off", async () => {
    mocks.listGrants.mockResolvedValue({
      data: null,
      error: new AuthApiError("off", 404, "feature_disabled"),
    });
    expect(await render()).toContain(en.Assistants.list.off);
  });

  it.each([
    [
      "Auth is down",
      () =>
        mocks.listGrants.mockResolvedValue({
          data: null,
          error: new AuthRetryableFetchError("down", 503),
        }),
    ],
    [
      "the database is down",
      () => mocks.rows.mockRejectedValue(new Error("lost")),
    ],
  ])("offers a retry when %s", async (_, fail) => {
    fail();
    const html = await render("es");
    expect(html).toContain(es.Assistants.list.unavailable);
    expect(html).toContain('href="/es/assistants"');
    expect(html).not.toContain("google-sign-in");
  });
});
