import "@/core/server-only";

import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from "jose";
import { z } from "zod";

import { ASSISTANT_AUDIENCE } from "@/core/assistant-access/audience";
import {
  enabledClient,
  type AssistantClient,
  type AssistantName,
} from "@/core/assistant-access/clients";
import { takeRequest } from "@/core/assistant-access/rate-limit";
import type { Clock } from "@/core/clock";
import type { DatabaseClient } from "@/core/db/client";

import { isHostAccount } from "./host-account";
import { verifiedGoogleGuestEmail } from "./verified-guest-email";

export type AssistantPrincipal = AssistantClient & { userId: string };

export type AssistantAccess =
  | { status: "ok"; principal: AssistantPrincipal }
  | { status: "refused" }
  | { status: "unavailable" }
  | { status: "limited"; assistant: AssistantName; retryAfter: number };

export type AssistantKeys = JWTVerifyGetKey & {
  jwks(): JSONWebKeySet | undefined;
};

export interface AssistantBearerDeps {
  database: DatabaseClient;
  clock: Clock;
  supabase: { url: string; key: string };
  /** The signing keys of `supabase.url` by default. */
  jwks?: AssistantKeys;
  fetch?: typeof fetch;
}

const AUTH_TIMEOUT_MS = 3_000;
const CLOCK_TOLERANCE_SECONDS = 5;
const BEARER = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i;

/** Auth answers that prove the connection ended. Any other failure is an outage. */
const ENDED_CONNECTION = new Set([
  "session_not_found",
  "user_not_found",
  "user_banned",
  "bad_jwt",
]);

const tokenClaims = z.object({
  aud: z.literal(ASSISTANT_AUDIENCE),
  exp: z.number(),
  iat: z.number(),
  sub: z.uuid(),
  client_id: z.uuid(),
  session_id: z.uuid(),
});

const authUser = z.object({
  id: z.string(),
  email: z.string().nullish(),
  email_confirmed_at: z.string().nullish(),
  identities: z.array(z.object({ provider: z.string() })).nullish(),
});
const authError = z.object({ error_code: z.string() });

class KeysUnavailable extends Error {}

const keySets = new Map<string, AssistantKeys>();

export const issuerOf = (supabaseUrl: string) =>
  `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;

/** The signing keys of Auth, cached for this process. */
function assistantKeys(supabaseUrl: string): AssistantKeys {
  const url = `${issuerOf(supabaseUrl)}/.well-known/jwks.json`;
  let keys = keySets.get(url);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(url), {
      timeoutDuration: AUTH_TIMEOUT_MS,
    });
    keySets.set(url, keys);
  }
  return keys;
}

/**
 * Turns the Authorization header of a connected assistant into a guest. It
 * reads no cookie or query. There is no identity cache, so that a revoked
 * connection ends at once.
 */
export async function resolveAssistant(
  authorizationHeader: string | null,
  deps: AssistantBearerDeps,
): Promise<AssistantAccess> {
  const token = BEARER.exec(authorizationHeader ?? "")?.[1];
  if (!token) return refused("refused_token");

  const now = deps.clock.now();
  const claims = await verifiedClaims(token, now, deps);
  if (claims === "invalid") return refused("refused_token");
  if (claims === "unavailable") return unavailable("unavailable_keys");

  let assistant: AssistantName | undefined;
  try {
    const client = await enabledClient(deps.database, claims.client_id);
    if (!client) return refused("refused_client");
    assistant = client.assistant;

    const userId = claims.sub;
    if (await isHostAccount(deps.database, userId, null))
      return refused("refused_host", assistant);
    const allowance = await takeRequest(
      deps.database,
      userId,
      client.clientId,
      now,
    );
    if (!allowance.allowed) {
      log("info", "limited", assistant);
      return {
        status: "limited",
        assistant,
        retryAfter: allowance.retryAfter,
      };
    }

    const user = await readUser(token, deps);
    if (user === "ended") return refused("refused_connection", assistant);
    if (user === "unavailable")
      return unavailable("unavailable_auth", assistant);
    const email = verifiedGoogleGuestEmail(user);
    if (user.id !== userId || !email)
      return refused("refused_identity", assistant);
    if (await isHostAccount(deps.database, userId, email))
      return refused("refused_host", assistant);
    return { status: "ok", principal: { userId, ...client } };
  } catch (error) {
    // Database and connection errors carry a code; a fault in this code does not.
    const database = error instanceof Error && "code" in error;
    return unavailable(
      database ? "unavailable_database" : "unavailable_internal",
      assistant,
    );
  }
}

async function verifiedClaims(
  token: string,
  now: Date,
  { supabase, jwks }: AssistantBearerDeps,
) {
  try {
    const { payload } = await jwtVerify(
      token,
      availableKeys(supabase.url, jwks),
      {
        algorithms: ["ES256"],
        issuer: issuerOf(supabase.url),
        audience: ASSISTANT_AUDIENCE,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: now,
      },
    );
    const claims = tokenClaims.safeParse(payload);
    const latestIssue = now.getTime() / 1000 + CLOCK_TOLERANCE_SECONDS;
    return claims.success && claims.data.iat <= latestIssue
      ? claims.data
      : ("invalid" as const);
  } catch (error) {
    return error instanceof KeysUnavailable
      ? ("unavailable" as const)
      : ("invalid" as const);
  }
}

/** Reading the keys is the only step of a verification that can meet an outage. */
function availableKeys(
  supabaseUrl: string,
  configured: AssistantKeys | undefined,
): JWTVerifyGetKey {
  return async (header, token) => {
    let keys: AssistantKeys | undefined;
    try {
      keys = configured ?? assistantKeys(supabaseUrl);
      return await keys(header, token);
    } catch (error) {
      const published = keys?.jwks()?.keys.length;
      if (
        published &&
        (error instanceof errors.JWKSNoMatchingKey ||
          error instanceof errors.JWKSMultipleMatchingKeys)
      )
        throw error;
      throw new KeysUnavailable();
    }
  };
}

async function readUser(token: string, deps: AssistantBearerDeps) {
  try {
    const response = await (deps.fetch ?? fetch)(
      `${issuerOf(deps.supabase.url)}/user`,
      {
        headers: {
          apikey: deps.supabase.key,
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      },
    );
    const body: unknown = await response.json();
    if (response.status === 200) return authUser.parse(body);
    const error = authError.safeParse(body);
    return error.success && ENDED_CONNECTION.has(error.data.error_code)
      ? ("ended" as const)
      : ("unavailable" as const);
  } catch {
    return "unavailable" as const;
  }
}

function refused(outcome: string, assistant?: AssistantName): AssistantAccess {
  log("info", outcome, assistant);
  return { status: "refused" };
}

function unavailable(
  outcome: string,
  assistant?: AssistantName,
): AssistantAccess {
  log("error", outcome, assistant);
  return { status: "unavailable" };
}

function log(
  level: "info" | "error",
  outcome: string,
  assistant?: AssistantName,
) {
  console[level]("[ASSISTANT_AUTH]", {
    outcome,
    ...(assistant ? { assistant } : {}),
  });
}
