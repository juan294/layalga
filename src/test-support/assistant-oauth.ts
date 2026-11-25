import { createHash, randomBytes, randomUUID } from "node:crypto";

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
  { token, json, form }: AuthCall = {},
): Promise<AuthAnswer> {
  const local = localSupabase();
  const response = await fetch(`${local.url}${path}`, {
    method,
    redirect: "manual",
    headers: {
      apikey: local.key,
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

/** Registers a public client the way an administrator does, without a secret. */
async function registerClient(
  sql: Sql,
  redirectUris: string = FIXTURE_CALLBACK,
): Promise<string> {
  const id = randomUUID();
  // Auth reads the optional text columns as strings, so they cannot be null.
  await sql`insert into auth.oauth_clients(id,client_secret_hash,registration_type,redirect_uris,grant_types,client_name,client_uri,logo_uri,client_type,token_endpoint_auth_method)
    values(${id},'','manual',${redirectUris},'authorization_code,refresh_token','Fixture assistant','','','public','none')`;
  return id;
}

async function allowClient(
  sql: Sql,
  clientId: string,
  { redirectUri = FIXTURE_CALLBACK, enabled = true } = {},
) {
  await sql`insert into public.assistant_clients(client_id,assistant,redirect_uri,enabled)
    values(${clientId},'claude',${redirectUri},${enabled})`;
}

async function deleteClient(sql: Sql, clientId: string) {
  await sql`delete from public.assistant_clients where client_id=${clientId}`;
  await sql`delete from auth.oauth_clients where id=${clientId}`;
  await sql`delete from public.assistant_request_windows where subject like ${`%:${clientId}`}`;
}

/** The complete authorization code flow with PKCE; returns the token answer. */
export async function codeFlow(
  user: Pick<FixtureUser, "accessToken">,
  clientId: string,
): Promise<AuthAnswer> {
  const verifier = randomBytes(32).toString("base64url");
  const authorize = await authCall(
    "GET",
    `/auth/v1/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: FIXTURE_CALLBACK,
      scope: "openid",
      state: "fixture",
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
    /** A registered client; `allow: null` leaves it off the allowlist. */
    async client({
      allow = {},
      registered,
    }: {
      allow?: { redirectUri?: string; enabled?: boolean } | null;
      registered?: string;
    } = {}) {
      const id = await registerClient(admin, registered);
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
      for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    },
  };
}
