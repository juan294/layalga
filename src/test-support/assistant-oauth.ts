import { createHash, randomBytes, randomUUID } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { decodeJwt } from "jose";
import type { Sql } from "postgres";

import { createFixtureHost } from "./host-account-cases";
import { localSupabase } from "./local-supabase";

export const FIXTURE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

export interface FixtureUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

interface AuthCall {
  token?: string;
  /** Another API key, such as the secret key for the admin API. */
  key?: string;
  json?: Record<string, unknown>;
  form?: Record<string, string>;
}

interface AuthAnswer {
  status: number;
  location: string | null;
  text: string;
  body: Record<string, unknown>;
}

export async function authCall(
  method: string,
  path: string,
  { token, key, json, form }: AuthCall = {},
): Promise<AuthAnswer> {
  const local = localSupabase();
  const response = await fetch(`${local.url}${path}`, {
    method,
    redirect: "manual",
    headers: {
      apikey: key ?? local.key,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(json ? { "content-type": "application/json" } : {}),
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: json
      ? JSON.stringify(json)
      : form
        ? new URLSearchParams(form).toString()
        : undefined,
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Not every answer is JSON.
  }
  return {
    status: response.status,
    location: response.headers.get("location"),
    text,
    body,
  };
}

export const tokenClaims = (token: unknown) => decodeJwt(String(token));

/** A confirmed local account, with a synthetic Google identity by default. */
async function createAssistantUser(
  sql: Sql,
  { google = true }: { google?: boolean } = {},
): Promise<FixtureUser> {
  const email = `assistant-${randomUUID()}@fixture.test`;
  const password = randomUUID();
  const { status, text, body } = await authCall("POST", "/auth/v1/signup", {
    json: { email, password },
  });
  const id = (body.user as { id?: string } | undefined)?.id;
  if (!id) throw new Error(`Local sign-up failed: ${status} ${text}`);
  try {
    if (google)
      await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values(${"google-" + id},${id},${sql.json({ sub: id, email, email_verified: true })},'google',now(),now())`;
  } catch (error) {
    await sql`delete from auth.users where id=${id}`;
    throw error;
  }
  return {
    id,
    email,
    password,
    accessToken: String(body.access_token),
    refreshToken: String(body.refresh_token),
  };
}

export async function webSignIn({
  email,
  password,
}: Pick<FixtureUser, "email" | "password">) {
  const answer = await authCall("POST", "/auth/v1/token?grant_type=password", {
    json: { email, password },
  });
  if (answer.status !== 200)
    throw new Error(`Local sign-in failed: ${answer.status} ${answer.text}`);
  return {
    accessToken: String(answer.body.access_token),
    refreshToken: String(answer.body.refresh_token),
  };
}

/** A web client whose cookies hold these tokens, as in a browser. */
export async function cookieClient({
  accessToken,
  refreshToken,
}: Pick<FixtureUser, "accessToken" | "refreshToken">) {
  const { url, key } = localSupabase();
  const jar = new Map<string, string>();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw new Error(`Local session failed: ${error.message}`);
  return supabase;
}

/** Registers a public client the way an administrator does, without a secret. */
async function registerClient(
  sql: Sql,
  {
    redirectUris = FIXTURE_CALLBACK,
    name = "Fixture assistant",
  }: { redirectUris?: string; name?: string } = {},
): Promise<string> {
  const id = randomUUID();
  // Auth reads the optional text columns as strings, so they cannot be null.
  await sql`insert into auth.oauth_clients(id,client_secret_hash,registration_type,redirect_uris,grant_types,client_name,client_uri,logo_uri,client_type,token_endpoint_auth_method)
    values(${id},'','manual',${redirectUris},'authorization_code,refresh_token',${name},'','','public','none')`;
  return id;
}

export async function allowClient(
  sql: Sql,
  clientId: string,
  { redirectUri = FIXTURE_CALLBACK, enabled = true } = {},
) {
  await sql`insert into public.assistant_clients(client_id,assistant,redirect_uri,enabled)
    values(${clientId},'claude',${redirectUri},${enabled})`;
}

export async function deleteClient(sql: Sql, clientId: string) {
  await sql`delete from public.assistant_clients where client_id=${clientId}`;
  await sql`delete from auth.oauth_clients where id=${clientId}`;
  await sql`delete from public.assistant_request_windows where subject like ${`%:${clientId}`}`;
}

/** The first step of an assistant: Auth redirects the browser to consent. */
export async function startAuthorization(
  clientId: string,
  { redirectUri = FIXTURE_CALLBACK, scope = "openid", state = "fixture" } = {},
) {
  const verifier = randomBytes(32).toString("base64url");
  const authorize = await authCall(
    "GET",
    `/auth/v1/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    })}`,
  );
  const authorizationId =
    authorize.location &&
    new URL(authorize.location, "http://local").searchParams.get(
      "authorization_id",
    );
  if (!authorizationId)
    throw new Error(`No authorization was started: ${authorize.status}`);
  return { authorizationId, verifier };
}

/** The complete authorization code flow with PKCE; returns the token answer. */
export async function codeFlow(
  user: Pick<FixtureUser, "accessToken">,
  clientId: string,
): Promise<AuthAnswer> {
  const { authorizationId, verifier } = await startAuthorization(clientId);
  const path = `/auth/v1/oauth/authorizations/${authorizationId}`;
  // The read binds the request to this account.
  await authCall("GET", path, { token: user.accessToken });
  const consent = await authCall("POST", `${path}/consent`, {
    token: user.accessToken,
    json: { action: "approve" },
  });
  const redirect = consent.body.redirect_url;
  const code =
    typeof redirect === "string" && new URL(redirect).searchParams.get("code");
  if (!code) throw new Error("No authorization code was issued");
  return exchangeCode(code, clientId, verifier);
}

export function exchangeCode(code: string, clientId: string, verifier: string) {
  return authCall("POST", "/auth/v1/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code,
      redirect_uri: FIXTURE_CALLBACK,
      client_id: clientId,
      code_verifier: verifier,
    },
  });
}

export function refreshClient(clientId: string, refreshToken: unknown) {
  return authCall("POST", "/auth/v1/oauth/token", {
    form: {
      grant_type: "refresh_token",
      refresh_token: String(refreshToken),
      client_id: clientId,
    },
  });
}

/** Builds accounts, clients and hosts, and removes them in reverse order. */
export function assistantFixtures(db: Sql, admin: Sql) {
  const cleanups: (() => Promise<unknown>)[] = [];
  return {
    async user(options?: { google?: boolean }) {
      const user = await createAssistantUser(db, options);
      cleanups.push(() => db`delete from auth.users where id=${user.id}`);
      return user;
    },
    /** What Auth recorded for one authorization request. */
    async authorization(authorizationId: string) {
      const [row] = await admin<
        { status: string; userId: string | null; hasCode: boolean }[]
      >`select status::text as status, user_id as "userId", authorization_code is not null as "hasCode"
        from auth.oauth_authorizations where authorization_id=${authorizationId}`;
      return row!;
    },
    expire: (authorizationId: string) =>
      admin`update auth.oauth_authorizations
        set created_at=now() - interval '1 hour', expires_at=now() - interval '1 minute'
        where authorization_id=${authorizationId}`,
    grantedAt: (clientId: string, time: string) =>
      admin`update auth.oauth_consents set granted_at=${time} where client_id=${clientId}`,
    /** Takes a client off the allowlist. */
    forget: (clientId: string) =>
      admin`delete from public.assistant_clients where client_id=${clientId}`,
    /** A registered client; `allow: null` leaves it off the allowlist. */
    async client({
      allow = {},
      registered,
      name,
    }: {
      allow?: { redirectUri?: string; enabled?: boolean } | null;
      registered?: string;
      name?: string;
    } = {}) {
      const id = await registerClient(admin, {
        redirectUris: registered,
        name,
      });
      cleanups.push(() => deleteClient(admin, id));
      if (allow) await allowClient(admin, id, allow);
      return id;
    },
    async host(options?: Parameters<typeof createFixtureHost>[1]) {
      const host = await createFixtureHost(db, options);
      cleanups.push(host.cleanup);
      return host.hostId;
    },
    defer: (cleanup: () => Promise<unknown>) => cleanups.push(cleanup),
    async cleanup() {
      const failures: unknown[] = [];
      for (const cleanup of cleanups.splice(0).reverse())
        await cleanup().catch((error: unknown) => failures.push(error));
      if (failures.length) throw failures[0];
    },
  };
}
