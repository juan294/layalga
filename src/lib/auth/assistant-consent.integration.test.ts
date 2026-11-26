import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  assistantFixtures,
  authCall,
  codeFlow,
  cookieClient,
  exchangeCode,
  FIXTURE_CALLBACK,
  startAuthorization,
  type FixtureUser,
} from "@/test-support/assistant-oauth";
import {
  localAdmin,
  localSupabase,
  localWebDatabase,
} from "@/test-support/local-supabase";

import {
  decideConsent,
  reviewConsent,
  startConsent,
  type ConsentDeps,
} from "./assistant-consent";

const db = postgres(localSupabase().databaseUrl, { max: 2, prepare: false });
const admin = localAdmin();
const web = localWebDatabase();
const fixtures = assistantFixtures(db, admin);

afterEach(() => fixtures.cleanup());
afterAll(async () => {
  await Promise.all([db, admin, web.sql].map((sql) => sql.end({ timeout: 5 })));
});

async function depsFor(
  session: Pick<FixtureUser, "accessToken" | "refreshToken">,
): Promise<ConsentDeps> {
  return {
    enabled: true,
    database: web.db,
    supabase: await cookieClient(session),
  };
}

/** Continue, from a page that shows the signed-in account. */
async function review(authorizationId: string, deps: ConsentDeps) {
  const shown = await startConsent(authorizationId, deps);
  return reviewConsent(
    authorizationId,
    shown.status === "start" ? shown.email : undefined,
    deps,
  );
}

async function grants(user: FixtureUser) {
  const { body } = await authCall("GET", "/auth/v1/user/oauth/grants", {
    token: user.accessToken,
  });
  return body as unknown as { client: { id: string } }[];
}

const UNTOUCHED = { status: "pending", userId: null, hasCode: false };

describe("assistant consent on local Auth", { timeout: 60_000 }, () => {
  it("shows the account and binds nothing until the guest continues", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client({ name: "Self-asserted name" });
    const { authorizationId } = await startAuthorization(client);
    const deps = await depsFor(user);

    expect(await startConsent(authorizationId, deps)).toEqual({
      status: "start",
      email: user.email,
    });
    expect(await fixtures.authorization(authorizationId)).toEqual(UNTOUCHED);

    expect(await review(authorizationId, deps)).toEqual({
      status: "review",
      email: user.email,
      assistant: "claude",
      domain: "claude.ai",
      scopes: [],
    });
    expect((await fixtures.authorization(authorizationId)).userId).toBe(
      user.id,
    );
  });

  it("leaves the request to another account after a load by the first", async () => {
    const first = await fixtures.user();
    const second = await fixtures.user();
    const client = await fixtures.client();
    const { authorizationId, verifier } = await startAuthorization(client);

    await startConsent(authorizationId, await depsFor(first));
    const deps = await depsFor(second);
    expect(await review(authorizationId, deps)).toMatchObject({
      status: "review",
      email: second.email,
    });
    const decided = await decideConsent(authorizationId, "allow", deps);
    expect(decided).toMatchObject({ status: "redirect", assistant: "claude" });
    const url = new URL((decided as { url: string }).url);
    expect(`${url.origin}${url.pathname}`).toBe(FIXTURE_CALLBACK);
    expect(url.searchParams.get("state")).toBe("fixture");
    const token = await exchangeCode(
      url.searchParams.get("code")!,
      client,
      verifier,
    );
    expect(token.status).toBe(200);
    expect(await grants(first)).toEqual([]);

    // The request now belongs to the second account.
    const other = await depsFor(first);
    expect(await review(authorizationId, other)).toEqual({
      status: "ended",
    });
    expect(await decideConsent(authorizationId, "deny", other)).toEqual({
      status: "ended",
    });
  });

  it("shows the new account when it changed after the page was shown", async () => {
    const shown = await fixtures.user();
    const current = await fixtures.user();
    const client = await fixtures.client();
    // The current account consented earlier, so a read would approve at once.
    expect((await codeFlow(current, client)).status).toBe(200);
    const { authorizationId } = await startAuthorization(client);

    expect(
      await reviewConsent(authorizationId, shown.email, await depsFor(current)),
    ).toEqual({ status: "start", email: current.email });
    expect(await fixtures.authorization(authorizationId)).toEqual(UNTOUCHED);
  });

  it("denies with the assistant's own callback and creates no grant", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    const { authorizationId } = await startAuthorization(client);
    const deps = await depsFor(user);
    await review(authorizationId, deps);

    const decided = await decideConsent(authorizationId, "deny", deps);
    expect(decided).toMatchObject({ status: "redirect" });
    const url = new URL((decided as { url: string }).url);
    expect(`${url.origin}${url.pathname}`).toBe(FIXTURE_CALLBACK);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.has("code")).toBe(false);
    expect(await grants(user)).toEqual([]);
  });

  it("decides a request once", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    const deps = await depsFor(user);
    for (const [first, second] of [
      ["deny", "allow"],
      ["allow", "deny"],
      ["allow", "allow"],
    ] as const) {
      const { authorizationId } = await startAuthorization(client);
      await review(authorizationId, deps);
      expect(await decideConsent(authorizationId, first, deps)).toMatchObject({
        status: "redirect",
      });
      expect(await decideConsent(authorizationId, second, deps)).toEqual({
        status: "ended",
      });
      expect(await review(authorizationId, deps)).toEqual({
        status: "ended",
      });
      await deps.supabase.auth.oauth.revokeGrant({ clientId: client });
    }
  });

  it.each(["before", "after"])(
    "ends a request that expired %s the guest continued",
    async (moment) => {
      const user = await fixtures.user();
      const client = await fixtures.client();
      const { authorizationId } = await startAuthorization(client);
      const deps = await depsFor(user);
      if (moment === "after") await review(authorizationId, deps);
      await fixtures.expire(authorizationId);

      expect(await review(authorizationId, deps)).toEqual({
        status: "ended",
      });
      expect(await decideConsent(authorizationId, "allow", deps)).toEqual({
        status: "ended",
      });
      expect(await grants(user)).toEqual([]);
    },
  );

  it("ends an unknown request", async () => {
    const deps = await depsFor(await fixtures.user());
    expect(await review("a".repeat(32), deps)).toEqual({
      status: "ended",
    });
  });

  it("never sends an earlier consent on by itself", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    expect((await codeFlow(user, client)).status).toBe(200);
    const { authorizationId } = await startAuthorization(client);
    const deps = await depsFor(user);

    expect(await startConsent(authorizationId, deps)).toMatchObject({
      status: "start",
    });
    expect(await fixtures.authorization(authorizationId)).toEqual(UNTOUCHED);

    const state = await review(authorizationId, deps);
    expect(state).toMatchObject({
      status: "continue",
      email: user.email,
      assistant: "claude",
    });
    const url = new URL((state as { url: string }).url);
    expect(`${url.origin}${url.pathname}`).toBe(FIXTURE_CALLBACK);
    expect(url.searchParams.get("code")).toBeTruthy();
  });

  it("answers two open requests separately", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    const deps = await depsFor(user);
    const [one, two] = [
      await startAuthorization(client),
      await startAuthorization(client),
    ];
    await review(one.authorizationId, deps);
    await review(two.authorizationId, deps);
    await decideConsent(one.authorizationId, "allow", deps);

    const denied = await decideConsent(two.authorizationId, "deny", deps);
    expect(denied).toMatchObject({ status: "redirect" });
    expect((denied as { url: string }).url).toContain("error=access_denied");
    expect(await grants(user)).toHaveLength(1);
  });

  it("offers an earlier consent when a decision arrives without a review", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    expect((await codeFlow(user, client)).status).toBe(200);
    const { authorizationId } = await startAuthorization(client);

    expect(
      await decideConsent(authorizationId, "deny", await depsFor(user)),
    ).toMatchObject({ status: "continue", assistant: "claude" });
  });

  it.each([
    [
      "its callback is on another domain",
      {
        name: "Claude",
        registered: "https://claude-ai.example/api/mcp/auth_callback",
        allow: null,
      },
    ],
    [
      "it is not on the allowlist, with the real callback",
      { name: "Claude", allow: null },
    ],
    [
      "its callback changed",
      {
        registered: "https://claude.ai/api/mcp/other",
        allow: { redirectUri: FIXTURE_CALLBACK },
      },
    ],
    ["it is disabled", { allow: { enabled: false } }],
  ] as [string, NonNullable<Parameters<typeof fixtures.client>[0]>][])(
    "refuses an assistant when %s",
    async (_, options) => {
      const user = await fixtures.user();
      const client = await fixtures.client(options);
      const { authorizationId } = await startAuthorization(client, {
        redirectUri: options.registered,
      });
      const deps = await depsFor(user);

      expect(await review(authorizationId, deps)).toEqual({
        status: "not_allowed",
      });
      expect(await decideConsent(authorizationId, "allow", deps)).toEqual({
        status: "not_allowed",
      });
      expect((await fixtures.authorization(authorizationId)).status).toBe(
        "pending",
      );
      expect(await grants(user)).toEqual([]);
    },
  );

  it("refuses an earlier consent whose assistant is no longer enabled", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    expect((await codeFlow(user, client)).status).toBe(200);
    await admin`update public.assistant_clients set enabled=false where client_id=${client}`;
    const { authorizationId, verifier } = await startAuthorization(client);
    const deps = await depsFor(user);

    // Auth approves the request on this read. The hook refuses its code.
    expect(await review(authorizationId, deps)).toEqual({
      status: "not_allowed",
    });
    const [row] = await admin<{ code: string }[]>`
      select authorization_code as code from auth.oauth_authorizations where authorization_id=${authorizationId}`;
    expect((await exchangeCode(row!.code, client, verifier)).status).toBe(403);
  });

  it.each(["bound", "prepared"])(
    "stops a %s host before the request is read",
    async (kind) => {
      const user = await fixtures.user();
      await fixtures.host(
        kind === "bound"
          ? { authUserId: user.id }
          : { preparedEmail: user.email },
      );
      const client = await fixtures.client();
      const { authorizationId } = await startAuthorization(client);
      const deps = await depsFor(user);

      for (const state of [
        await startConsent(authorizationId, deps),
        await review(authorizationId, deps),
        await decideConsent(authorizationId, "allow", deps),
      ])
        expect(state).toEqual({ status: "host" });
      expect(await fixtures.authorization(authorizationId)).toEqual(UNTOUCHED);
    },
  );

  it("stops an account without a verified Google identity before the request is read", async () => {
    const user = await fixtures.user({ google: false });
    const client = await fixtures.client();
    const { authorizationId } = await startAuthorization(client);
    const deps = await depsFor(user);

    for (const state of [
      await startConsent(authorizationId, deps),
      await review(authorizationId, deps),
      await decideConsent(authorizationId, "allow", deps),
    ])
      expect(state).toEqual({ status: "sign_in" });
    expect(await fixtures.authorization(authorizationId)).toEqual(UNTOUCHED);
  });

  it("treats a connected client's token in the cookie as signed out", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    const { body } = await codeFlow(user, client);
    const { authorizationId } = await startAuthorization(client);
    const deps = await depsFor({
      accessToken: String(body.access_token),
      refreshToken: String(body.refresh_token),
    });

    for (const state of [
      await startConsent(authorizationId, deps),
      await review(authorizationId, deps),
      await decideConsent(authorizationId, "allow", deps),
    ])
      expect(state).toEqual({ status: "sign_in" });
    expect(await fixtures.authorization(authorizationId)).toEqual(UNTOUCHED);
  });

  it("returns to sign-in when the session ended while consent was open", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    const { authorizationId } = await startAuthorization(client);
    const deps = await depsFor(user);
    await review(authorizationId, deps);
    await authCall("POST", "/auth/v1/logout?scope=local", {
      token: user.accessToken,
    });

    expect(await decideConsent(authorizationId, "allow", deps)).toEqual({
      status: "sign_in",
    });
    const consents =
      await admin`select 1 from auth.oauth_consents where user_id=${user.id}`;
    expect(consents).toHaveLength(0);
  });

  it("lists scopes beyond sign-in and refresh", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    const { authorizationId } = await startAuthorization(client, {
      scope: "openid offline_access email profile",
    });
    expect(await review(authorizationId, await depsFor(user))).toMatchObject({
      status: "review",
      scopes: ["email", "profile"],
    });
  });
});
