import { createHash, randomBytes, randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";

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
  key?: string;
}

export interface AuthAnswer {
  status: number;
  location: string | null;
  text: string;
  body: Record<string, unknown>;
}

function isLocal(value: string) {
  return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname);
}

/** The disposable local stack only. Refuses any other database or Auth URL. */
export function localSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54621";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
  if (!isLocal(url) || !isLocal(databaseUrl))
    throw new Error("Assistant fixtures require local Supabase");
  // The default postgres login cannot switch to the Auth and runtime roles.
  const admin = new URL(databaseUrl);
  admin.username = "supabase_admin";
  return {
    url,
    key,
    issuer: `${url}/auth/v1`,
    databaseUrl,
    adminUrl: admin.toString(),
  };
}

export function localAdmin(role?: string) {
  return postgres(localSupabase().adminUrl, {
    max: 1,
    prepare: false,
    ...(role ? { connection: { role } } : {}),
  });
}

export async function authCall(
  method: string,
  path: string,
  { token, json, form, key }: AuthCall = {},
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

export function tokenClaims(token: unknown): Record<string, unknown> {
  if (typeof token !== "string") throw new Error("No token was issued");
  return JSON.parse(
    Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
  ) as Record<string, unknown>;
}

/** A confirmed local account, with a synthetic Google identity by default. */
export async function createAssistantUser(
  sql: Sql,
  { google = true }: { google?: boolean } = {},
): Promise<FixtureUser> {
  const email = `assistant-${randomUUID()}@fixture.test`;
  const password = randomUUID();
  const signUp = await authCall("POST", "/auth/v1/signup", {
    json: { email, password },
  });
  const id = (signUp.body.user as { id?: string } | undefined)?.id;
  if (!id)
    throw new Error(`Local sign-up failed: ${signUp.status} ${signUp.text}`);
  if (google)
    await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      values(${"google-" + id},${id},${sql.json({ sub: id, email, email_verified: true })},'google',now(),now())`;
  const signIn = await webSignIn({ email, password });
  return { id, email, password, ...signIn };
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
export async function registerClient(
  sql: Sql,
  redirectUris: string = FIXTURE_CALLBACK,
): Promise<string> {
  const id = randomUUID();
  // Auth reads the optional text columns as strings, so they cannot be null.
  await sql`insert into auth.oauth_clients(id,client_secret_hash,registration_type,redirect_uris,grant_types,client_name,client_uri,logo_uri,client_type,token_endpoint_auth_method)
    values(${id},'','manual',${redirectUris},'authorization_code,refresh_token','Fixture assistant','','','public','none')`;
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
}

/** The complete authorization code flow with PKCE; returns the token answer. */
export async function codeFlow(
  user: Pick<FixtureUser, "accessToken">,
  clientId: string,
  { redirectUri = FIXTURE_CALLBACK, scope = "openid" } = {},
): Promise<AuthAnswer> {
  const verifier = randomBytes(32).toString("base64url");
  const authorize = await authCall(
    "GET",
    `/auth/v1/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
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
  const details = await authCall("GET", path, { token: user.accessToken });
  let redirect: unknown = details.body.redirect_url;
  if (!redirect) {
    const consent = await authCall("POST", `${path}/consent`, {
      token: user.accessToken,
      json: { action: "approve" },
    });
    redirect = consent.body.redirect_url;
  }
  const code =
    typeof redirect === "string" && new URL(redirect).searchParams.get("code");
  if (!code) throw new Error("No authorization code was issued");
  return authCall("POST", "/auth/v1/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
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
