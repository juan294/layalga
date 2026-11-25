import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { webSession } from "@/test-support/web-session";

const CLIENT = "5b88d492-348d-4f5a-8c00-55a8dfe0aee4";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const ID = "6qozma2yk5o6zzzh6t7ozzpowz2l4h5t";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAuthorizationDetails: vi.fn(),
  approveAuthorization: vi.fn(),
  denyAuthorization: vi.fn(),
  rows: vi.fn(),
  claims: {} as Record<string, unknown>,
}));

// Supabase and the database driver are replaced; the rules between them are real.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      ...webSession(mocks.getUser, mocks.claims).auth,
      oauth: {
        getAuthorizationDetails: mocks.getAuthorizationDetails,
        approveAuthorization: mocks.approveAuthorization,
        denyAuthorization: mocks.denyAuthorization,
      },
    },
  }),
}));
vi.mock("@/core/db/client", () => ({
  sqlClient: (database: unknown) => database,
  getDatabaseConnection: () => ({
    db: async (text: TemplateStringsArray) => mocks.rows(text.join("?")),
  }),
}));

import { continueAssistantConsent, decideAssistantAccess } from "./actions";

const user = {
  id: "user-1",
  email: "guest@example.com",
  email_confirmed_at: "2030-01-01",
  identities: [{ provider: "google" }],
};
const details = {
  authorization_id: ID,
  redirect_uri: CALLBACK,
  client: { id: CLIENT, name: "Self-asserted name" },
  user: { id: "user-1", email: "guest@example.com" },
  scope: "openid",
};
const row = {
  clientId: CLIENT,
  assistant: "claude",
  redirectUri: CALLBACK,
  enabled: true,
};

let host: boolean;
let allowlist: (typeof row)[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("ASSISTANT_ACCESS", "on");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  host = false;
  allowlist = [row];
  mocks.claims = {};
  mocks.getUser.mockResolvedValue({ data: { user } });
  mocks.rows.mockImplementation((text: string) =>
    text.includes("assistant_clients") ? allowlist : [{ host }],
  );
  mocks.getAuthorizationDetails.mockResolvedValue({
    data: details,
    error: null,
  });
  mocks.approveAuthorization.mockResolvedValue({
    data: { redirect_url: `${CALLBACK}?code=c&state=s` },
    error: null,
  });
  mocks.denyAuthorization.mockResolvedValue({
    data: { redirect_url: `${CALLBACK}?error=access_denied&state=s` },
    error: null,
  });
});

const decided = () => [
  ...mocks.approveAuthorization.mock.calls,
  ...mocks.denyAuthorization.mock.calls,
];

describe("assistant consent actions", () => {
  it("reviews a known assistant and never returns its self-asserted name", async () => {
    const state = await continueAssistantConsent(ID);
    expect(state).toEqual({
      status: "review",
      email: "guest@example.com",
      assistant: "claude",
      domain: "claude.ai",
      scopes: [],
    });
    expect(decided()).toEqual([]);
  });

  it.each([
    ["allow", mocks.approveAuthorization, "code=c"],
    ["deny", mocks.denyAuthorization, "error=access_denied"],
  ] as const)(
    "answers %s without a browser redirect",
    async (decision, call, query) => {
      expect(await decideAssistantAccess(ID, decision)).toEqual({
        status: "redirect",
        assistant: "claude",
        url: `${CALLBACK}?${query}&state=s`,
      });
      expect(call).toHaveBeenCalledExactlyOnceWith(ID, {
        skipBrowserRedirect: true,
      });
      expect(decided()).toHaveLength(1);
    },
  );

  it.each([
    "https://evil.example/api/mcp/auth_callback?code=c",
    "https://claude.ai.evil.example/api/mcp/auth_callback?code=c",
    "https://claude.ai/api/mcp/auth_callback/other?code=c",
    "https://claude.ai/api/mcp/auth_callback2?code=c",
    "https://claude.ai@evil.example/?https://claude.ai/api/mcp/auth_callback?code=c",
    "javascript:alert(1)",
  ])("does not return another address: %s", async (redirect_url) => {
    const answer = { data: { redirect_url }, error: null };
    mocks.approveAuthorization.mockResolvedValue(answer);
    mocks.denyAuthorization.mockResolvedValue(answer);
    for (const decision of ["allow", "deny"])
      expect(await decideAssistantAccess(ID, decision)).toEqual({
        status: "not_allowed",
      });
    mocks.getAuthorizationDetails.mockResolvedValue(answer);
    expect(await continueAssistantConsent(ID)).toEqual({
      status: "not_allowed",
    });
  });

  it("offers an earlier consent as a link and decides nothing", async () => {
    const url = `${CALLBACK}?code=c&state=s`;
    mocks.getAuthorizationDetails.mockResolvedValue({
      data: { redirect_url: url },
      error: null,
    });
    for (const state of [
      await continueAssistantConsent(ID),
      await decideAssistantAccess(ID, "allow"),
    ])
      expect(state).toEqual({ status: "continue", assistant: "claude", url });
    expect(decided()).toEqual([]);
  });

  it.each([
    ["unknown", () => (allowlist = [])],
    ["disabled", () => (allowlist = [{ ...row, enabled: false }])],
    [
      "known by another callback",
      () => (allowlist = [{ ...row, redirectUri: `${CALLBACK}/other` }]),
    ],
    [
      "another client with the same callback",
      () =>
        (allowlist = [
          { ...row, clientId: "00000000-0000-4000-8000-000000000009" },
        ]),
    ],
  ])("refuses an assistant that is %s", async (_, change) => {
    change();
    expect(await continueAssistantConsent(ID)).toEqual({
      status: "not_allowed",
    });
    expect(await decideAssistantAccess(ID, "allow")).toEqual({
      status: "not_allowed",
    });
    expect(decided()).toEqual([]);
  });

  it.each([
    ["off", "the switch is off", () => vi.stubEnv("ASSISTANT_ACCESS", "none")],
    ["off", "nothing is configured", () => vi.stubEnv("ASSISTANT_ACCESS", "")],
    [
      "sign_in",
      "nobody is signed in",
      () => mocks.getUser.mockResolvedValue({ data: { user: null } }),
    ],
    [
      "sign_in",
      "the account has no Google identity",
      () =>
        mocks.getUser.mockResolvedValue({
          data: { user: { ...user, identities: [{ provider: "email" }] } },
        }),
    ],
    [
      "sign_in",
      "the cookie holds a client token",
      () => (mocks.claims = { client_id: CLIENT }),
    ],
    ["host", "the account belongs to a host", () => (host = true)],
    [
      "unavailable",
      "Auth cannot be reached",
      () =>
        mocks.getUser.mockResolvedValue({
          data: { user: null },
          error: new AuthRetryableFetchError("fetch failed", 0),
        }),
    ],
    [
      "unavailable",
      "the database fails",
      () => mocks.rows.mockRejectedValue(new Error("connection lost")),
    ],
  ])(
    "stops with %s before reading the request when %s",
    async (status, _, change) => {
      change();
      expect(await continueAssistantConsent(ID)).toEqual({ status });
      expect(await decideAssistantAccess(ID, "allow")).toEqual({ status });
      expect(mocks.getAuthorizationDetails).not.toHaveBeenCalled();
      expect(decided()).toEqual([]);
    },
  );

  it.each([
    undefined,
    null,
    42,
    "",
    "short",
    `${ID}/../../user`,
    `${ID}?x=1`,
    "a".repeat(129),
    [ID],
  ])("refuses a request ID of the wrong form: %s", async (id) => {
    expect(await continueAssistantConsent(id)).toEqual({ status: "invalid" });
    expect(await decideAssistantAccess(id, "allow")).toEqual({
      status: "invalid",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "approve", "ALLOW", ["allow"]])(
    "refuses an unknown decision: %s",
    async (decision) => {
      expect(await decideAssistantAccess(ID, decision)).toEqual({
        status: "invalid",
      });
      expect(mocks.getAuthorizationDetails).not.toHaveBeenCalled();
    },
  );

  // The codes and statuses that local Auth v2.198.0 answers.
  it.each([
    ["off", new AuthApiError("off", 404, "feature_disabled")],
    ["ended", new AuthApiError("gone", 404, "oauth_authorization_not_found")],
    ["ended", new AuthApiError("used", 400, "validation_failed")],
    ["ended", new AuthApiError("deleted", 404, "oauth_client_not_found")],
    ["sign_in", new AuthSessionMissingError()],
    ["sign_in", new AuthApiError("bad token", 403, "bad_jwt")],
    ["sign_in", new AuthApiError("no", 401, "no_authorization")],
    ["unavailable", new AuthApiError("no route", 404, undefined)],
    [
      "unavailable",
      new AuthApiError("slow down", 429, "over_request_rate_limit"),
    ],
    ["unavailable", new AuthRetryableFetchError("fetch failed", 0)],
    ["unavailable", new AuthRetryableFetchError("down", 503)],
  ])("maps an Auth failure to %s", async (status, error) => {
    mocks.approveAuthorization.mockResolvedValue({ data: null, error });
    mocks.denyAuthorization.mockResolvedValue({ data: null, error });
    for (const decision of ["allow", "deny"])
      expect(await decideAssistantAccess(ID, decision)).toEqual({ status });

    mocks.getAuthorizationDetails.mockResolvedValue({ data: null, error });
    expect(await continueAssistantConsent(ID)).toEqual({ status });
    expect(decided()).toHaveLength(2);
  });

  it("reports a thrown fault without the request or the address", async () => {
    mocks.approveAuthorization.mockRejectedValue(
      new Error(`${CALLBACK}?code=secret ${ID}`),
    );
    expect(await decideAssistantAccess(ID, "allow")).toEqual({
      status: "unavailable",
    });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("assistant_consent_failed");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain(ID);
  });
});
