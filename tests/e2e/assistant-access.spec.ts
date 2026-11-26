import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import { expect, test, type Page } from "@playwright/test";

import en from "../../messages/en.json" with { type: "json" };
import { ASSISTANT_AUDIENCE } from "../../src/core/assistant-access/audience";
import { searchPublicStays } from "../../src/core/booking/public-stay-search";
import { submitStayRequest } from "../../src/core/booking/stay-requests";
import { closeDatabase } from "../../src/core/db/client";
import {
  authCall,
  FIXTURE_CALLBACK,
  refreshClient,
  startAuthorization,
  tokenClaims,
} from "../../src/test-support/assistant-oauth";
import { createFixtureHost } from "../../src/test-support/host-account-cases";
import {
  localAdmin,
  localSupabase,
} from "../../src/test-support/local-supabase";
import { openHousehold } from "./helpers/household";
import { createFixtureRequester } from "./helpers/requester";

// One guest, one registered client and one browser, from the first 401 to the
// vendor stop. Auth, the consent page and /api/mcp are the real local ones;
// only the assistant's own domain is intercepted.
test.setTimeout(240_000);
test.afterAll(closeDatabase);

const t = en.Assistants;
const criteria = {
  from: "2090-07-01",
  to: "2090-07-15",
  nights: 14,
  adults: 2,
  children: 0,
  pets: 0,
};

/** The secret key of the local stack, for the Auth admin API only. */
function localSecretKey(): string {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  const status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as { API_URL?: string; SECRET_KEY?: string };
  // The key must belong to the stack that the fixtures use.
  if (status.API_URL !== localSupabase().url || !status.SECRET_KEY)
    throw new Error("The local stack does not match NEXT_PUBLIC_SUPABASE_URL");
  return status.SECRET_KEY;
}

/** The Auth admin API, as an operator uses it at activation gate G4. */
async function adminCall(method: string, path: string, body?: unknown) {
  const key = localSecretKey();
  const response = await fetch(`${localSupabase().url}/auth/v1/admin${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
  };
}

/** Claude, as far as the official client can play it: one connection and its tokens. */
function assistant(clientId: string, endpoint: string) {
  const held: {
    url?: URL;
    verifier: string;
    tokens?: StoredOAuthTokens;
    discovery?: OAuthDiscoveryState;
  } = { verifier: "" };
  const provider: OAuthClientProvider = {
    get redirectUrl() {
      return FIXTURE_CALLBACK;
    },
    get clientMetadata() {
      return {
        redirect_uris: [FIXTURE_CALLBACK],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      };
    },
    // Pre-registered: the SDK never registers.
    clientInformation: () => ({ client_id: clientId }),
    tokens: () => held.tokens,
    saveTokens: (tokens) => {
      held.tokens = tokens;
    },
    redirectToAuthorization: (url) => {
      held.url = url;
    },
    saveCodeVerifier: (verifier) => {
      held.verifier = verifier;
    },
    codeVerifier: () => held.verifier,
    // Binds the code to the authorization server that issued it.
    saveDiscoveryState: (state) => {
      held.discovery = state;
    },
    discoveryState: () => held.discovery,
    state: () => "journey",
  };
  const transport = () =>
    new StreamableHTTPClientTransport(new URL(endpoint), {
      authProvider: provider,
    });
  const open = async (into = transport()) => {
    const client = new Client({ name: "journey", version: "1" });
    await client.connect(into);
    return client;
  };
  return { held, transport, open };
}

/** A raw tool call with the access token that the assistant holds now. */
async function rawStatus(endpoint: string, token: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/call",
      "mcp-name": "read_request_status",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "read_request_status",
        arguments: {},
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "raw", version: "1" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
  return response.status;
}

const structured = (result: unknown) =>
  (result as { structuredContent: Record<string, unknown> }).structuredContent;

/** What Claude's callback received; nothing leaves the machine. */
function interceptCallback(page: Page) {
  const arrivals: URL[] = [];
  return {
    arrivals,
    install: () =>
      page.context().route("https://claude.ai/**", (route) => {
        arrivals.push(new URL(route.request().url()));
        return route.fulfill({ contentType: "text/html", body: "Assistant" });
      }),
  };
}

test("a guest connects Claude, reads three answers, and every stop holds", async ({
  page,
  context,
  baseURL,
}) => {
  const endpoint = `${baseURL}/api/mcp`;
  const local = localSupabase();
  const household = await openHousehold({ parties: [] });
  const admin = localAdmin();
  const requester = await createFixtureRequester(household.db);
  const removeHost: (() => Promise<unknown>)[] = [];
  let clientId = "";
  try {
    const [listing] = await household.db<{ handle: string }[]>`
      insert into public.household_public_listings(home_id,display_name,search_name,published)
      values(${household.homeId},'Journey Vega','journey vega',true) returning handle`;
    const handle = listing!.handle;
    const [option] = (await searchPublicStays(handle, criteria)).options;
    const pending = await submitStayRequest(requester, {
      handle,
      criteria,
      roomRefs: option!.recommendedRoomRefs,
      overflowConsent: false,
      notes: "",
      requests: "",
      locale: "en",
      idempotencyKey: randomUUID(),
    });
    expect(pending.status).toBe("pending");

    // Gate G4 in the runbook: one public manual client with the exact callback.
    const created = await adminCall("POST", "/oauth/clients", {
      client_name: "Claude",
      redirect_uris: [FIXTURE_CALLBACK],
      client_type: "public",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
    });
    expect(created.status).toBe(201);
    clientId = String(created.body.client_id);
    expect(created.body.registration_type).toBe("manual");
    expect(created.body.redirect_uris).toEqual([FIXTURE_CALLBACK]);
    await admin`insert into public.assistant_clients(client_id,assistant,redirect_uri,enabled)
      values(${clientId},'claude',${FIXTURE_CALLBACK},true)`;

    const callback = interceptCallback(page);
    await callback.install();
    const claude = assistant(clientId, endpoint);

    /** The official client meets a 401; the guest approves in the browser. */
    async function connect(): Promise<Client> {
      claude.held.url = undefined;
      const first = claude.transport();
      await expect(claude.open(first)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      const url = claude.held.url as URL | undefined;
      if (!url) throw new Error("The client did not start an authorization");
      await page.goto(url.href);
      await page.getByTestId("assistant-continue").click();
      await page.getByTestId("assistant-allow").click();
      await page.waitForURL("https://claude.ai/**");
      const arrival = callback.arrivals.at(-1)!;
      expect(`${arrival.origin}${arrival.pathname}`).toBe(FIXTURE_CALLBACK);
      expect(arrival.searchParams.get("state")).toBe("journey");
      // Code exchange with the PKCE verifier that the client kept.
      await first.finishAuth(arrival.searchParams.get("code")!);
      return claude.open();
    }

    let client!: Client;
    await test.step("1. a request without a token leads the client to local Auth", async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain(
        `resource_metadata="${baseURL}/.well-known/oauth-protected-resource/api/mcp"`,
      );

      await expect(claude.open()).rejects.toBeInstanceOf(UnauthorizedError);
      const url = claude.held.url!;
      expect(`${url.origin}${url.pathname}`).toBe(
        `${local.issuer}/oauth/authorize`,
      );
      expect(url.searchParams.get("client_id")).toBe(clientId);
      expect(url.searchParams.get("redirect_uri")).toBe(FIXTURE_CALLBACK);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("resource")).toBe(endpoint);
    });

    await test.step("2. consent after sign-in, then the code exchange", async () => {
      await requester.signIn(context);
      client = await connect();
      const claims = tokenClaims(claude.held.tokens!.access_token);
      expect(claims.aud).toBe(ASSISTANT_AUDIENCE);
      expect(claims.client_id).toBe(clientId);
      expect(claims.sub).toBe(requester.userId);
      // The hook blanks the address and drops the profile.
      expect(claims.email).toBe("");
      expect(claims.role).toBe("layalga_assistant");
      expect(claims.user_metadata).toBeUndefined();
      expect(claims.scope).toBe("openid offline_access");
    });

    const readStatus = async () =>
      structured(
        await client.callTool({ name: "read_request_status", arguments: {} }),
      );
    const ownRequest = {
      household: "Journey Vega",
      checkIn: criteria.from,
      checkout: criteria.to,
      requestStatus: "pending",
      visitStatus: null,
    };

    await test.step("3. the three tools answer with the fixture data", async () => {
      expect(
        structured(
          await client.callTool({
            name: "find_households",
            arguments: { name: "Journey Vega" },
          }),
        ),
      ).toStrictEqual({
        status: "success",
        households: [
          {
            handle,
            name: "Journey Vega",
            pageUrl: `${baseURL}/stays/${handle}`,
          },
        ],
        truncated: false,
      });
      const stays = structured(
        await client.callTool({
          name: "search_stays",
          arguments: { handle, ...criteria },
        }),
      );
      expect(stays.status).toBe("success");
      expect(stays.stays).toEqual([
        expect.objectContaining({
          checkIn: criteria.from,
          checkout: criteria.to,
        }),
      ]);
      expect(await readStatus()).toStrictEqual({
        status: "success",
        requests: [ownRequest],
        truncated: false,
        historyUrl: `${baseURL}/requests`,
      });
    });

    await test.step("4. web sign-out leaves the assistant connected", async () => {
      await page.goto("/en/assistants");
      await page.getByRole("button", { name: en.Brand.signOut }).click();
      await expect(page).toHaveURL(/\/en\/sign-in$/);
      expect((await readStatus()).requests).toEqual([ownRequest]);
    });

    await test.step("5. disconnect ends the token and its refresh", async () => {
      const held = claude.held.tokens!;
      await requester.signIn(context);
      await page.goto("/en/assistants");
      await page.getByRole("button", { name: "Disconnect Claude" }).click();
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Disconnected: Claude.",
      );
      expect(await rawStatus(endpoint, held.access_token)).toBe(401);
      expect((await refreshClient(clientId, held.refresh_token)).status).toBe(
        400,
      );
      // The official client cannot recover alone: it asks for a new approval.
      claude.held.url = undefined;
      await expect(readStatus()).rejects.toBeInstanceOf(UnauthorizedError);
      expect(claude.held.url).toBeDefined();
      await client.close();
    });

    await test.step("6. a disabled client stops at once, and consent says why", async () => {
      client = await connect();
      expect((await readStatus()).status).toBe("success");
      const held = claude.held.tokens!;
      await admin`update public.assistant_clients set enabled=false where client_id=${clientId}`;
      expect(await rawStatus(endpoint, held.access_token)).toBe(401);
      const refresh = await refreshClient(clientId, held.refresh_token);
      expect(refresh.status).not.toBe(200);
      expect(refresh.body.access_token).toBeUndefined();
      const { authorizationId } = await startAuthorization(clientId);
      await page.goto(`/en/oauth/consent?authorization_id=${authorizationId}`);
      await page.getByTestId("assistant-continue").click();
      await expect(page.getByRole("main")).toContainText(
        t.states.not_allowed.title,
      );
      await expect(page.getByTestId("assistant-allow")).toHaveCount(0);
      await client.close();
    });

    let liveToken = "";
    await test.step("7. a guest who becomes a host is refused", async () => {
      // The kill switch is reversible: the grant stayed, so the same token works again.
      await admin`update public.assistant_clients set enabled=true where client_id=${clientId}`;
      client = await claude.open();
      expect((await readStatus()).status).toBe("success");
      liveToken = claude.held.tokens!.access_token;
      const host = await createFixtureHost(household.db, {
        authUserId: requester.userId,
      });
      removeHost.push(host.cleanup);
      expect(await rawStatus(endpoint, liveToken)).toBe(401);
      const { authorizationId } = await startAuthorization(clientId);
      await page.goto(`/en/oauth/consent?authorization_id=${authorizationId}`);
      await expect(page.getByRole("main")).toContainText(t.states.host.title);
      await expect(page.getByTestId("assistant-continue")).toHaveCount(0);
      await client.close();
    });

    await test.step("8. dynamic registration is refused", async () => {
      const registration = await authCall(
        "POST",
        "/auth/v1/oauth/clients/register",
        {
          json: {
            client_name: "Claude",
            redirect_uris: [FIXTURE_CALLBACK],
          },
        },
      );
      expect(registration.status).toBe(403);
      expect(registration.body.error_code).toBe(
        "oauth_dynamic_client_registration_disabled",
      );
    });

    await test.step("9. the vendor stop ends identity reads, not web sessions", async () => {
      // The live client token still reads the identity at Auth (accepted limit 1).
      expect(
        (await authCall("GET", "/auth/v1/user", { token: liveToken })).status,
      ).toBe(200);
      const web = await requester.accessToken();
      await admin`delete from auth.sessions where oauth_client_id=${clientId}`;
      const user = await authCall("GET", "/auth/v1/user", { token: liveToken });
      expect(user.status).toBe(403);
      expect(user.body.error_code).toBe("session_not_found");
      const info = await authCall("GET", "/auth/v1/oauth/userinfo", {
        token: liveToken,
      });
      expect(info.status).not.toBe(200);
      expect(info.text).not.toContain(requester.email);
      expect(
        (await authCall("GET", "/auth/v1/user", { token: web })).status,
      ).toBe(200);
      await page.goto("/en/assistants");
      await expect(page.getByTestId("google-sign-in")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: en.Brand.signOut }),
      ).toBeVisible();
    });
  } finally {
    for (const cleanup of removeHost) await cleanup();
    if (clientId) {
      await adminCall("DELETE", `/oauth/clients/${clientId}`);
      // The admin API keeps a deleted row with deleted_at; remove it.
      await admin`delete from public.assistant_clients where client_id=${clientId}`;
      await admin`delete from public.assistant_request_windows where subject like ${`%:${clientId}`}`;
      await admin`delete from auth.oauth_clients where id=${clientId}`;
    }
    await requester.cleanup();
    await household.close();
    try {
      const [left] = await admin<
        {
          clients: number;
          allowed: number;
          windows: number;
          sessions: number;
          users: number;
          homes: number;
        }[]
      >`select
          (select count(*)::int from auth.oauth_clients where id::text=${clientId}) as clients,
          (select count(*)::int from public.assistant_clients where client_id::text=${clientId}) as allowed,
          (select count(*)::int from public.assistant_request_windows where subject like ${`%:${clientId || "none"}`}) as windows,
          (select count(*)::int from auth.sessions where oauth_client_id::text=${clientId}) as sessions,
          (select count(*)::int from auth.users where id=${requester.userId}) as users,
          (select count(*)::int from public.homes where id=${household.homeId}) as homes`;
      expect(left).toEqual({
        clients: 0,
        allowed: 0,
        windows: 0,
        sessions: 0,
        users: 0,
        homes: 0,
      });
    } finally {
      await admin.end({ timeout: 5 });
    }
  }
});
