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
import { takeRequest } from "@/core/assistant-access/rate-limit";
import type { Clock } from "@/core/clock";
import { sqlClient, type DatabaseClient } from "@/core/db/client";

import { isHostAccount } from "./host-account";
import { verifiedGoogleGuestEmail } from "./verified-guest-email";

export type AssistantName = "claude" | "chatgpt";

export interface AssistantPrincipal {
  userId: string;
  clientId: string;
  assistant: AssistantName;
}

export type AssistantAccess =
  | { status: "ok"; principal: AssistantPrincipal }
  | { status: "refused" }
  | { status: "unavailable" }
  | { status: "limited"; retryAfter: number };

export type AssistantKeys = JWTVerifyGetKey & {
  jwks(): JSONWebKeySet | undefined;
};

export interface AssistantBearerDeps {
  database: DatabaseClient;
  clock: Clock;
  supabase: { url: string; key: string };
  jwks: AssistantKeys;
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

/** Failures of the token itself. Any other verification failure is an outage. */
const INVALID_TOKEN = [
  errors.JWSInvalid,
  errors.JWTInvalid,
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
];

const tokenClaims = z.object({
  aud: z.literal(ASSISTANT_AUDIENCE),
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

const keySets = new Map<string, AssistantKeys>();

const issuerOf = (supabaseUrl: string) =>
  `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;

/** The signing keys of Auth, cached for this process. */
export function assistantKeys(supabaseUrl: string): AssistantKeys {
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
    const [client] = await sqlClient(deps.database)<
      { client_id: string; assistant: AssistantName }[]
    >`
      select client_id, assistant from public.assistant_clients
      where client_id = ${claims.client_id} and enabled
    `;
    if (!client) return refused("refused_client");
    assistant = client.assistant;

    const userId = claims.sub;
    if (await isHostAccount(deps.database, userId, null))
      return refused("refused_host", assistant);
    const allowance = await takeRequest(
      deps.database,
      userId,
      client.client_id,
      now,
    );
    if (!allowance.allowed) {
      log("info", "limited", assistant);
      return { status: "limited", retryAfter: allowance.retryAfter };
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
    return {
      status: "ok",
      principal: { userId, clientId: client.client_id, assistant },
    };
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
  deps: AssistantBearerDeps,
) {
  try {
    const { payload } = await jwtVerify(token, deps.jwks, {
      algorithms: ["ES256"],
      issuer: issuerOf(deps.supabase.url),
      audience: ASSISTANT_AUDIENCE,
      requiredClaims: ["exp", "iat"],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate: now,
    });
    const claims = tokenClaims.safeParse(payload);
    const latestIssue = now.getTime() / 1000 + CLOCK_TOLERANCE_SECONDS;
    return claims.success && claims.data.iat <= latestIssue
      ? claims.data
      : ("invalid" as const);
  } catch (error) {
    // No token can match a key while Auth publishes none.
    if (deps.jwks.jwks()?.keys.length === 0) return "unavailable" as const;
    return INVALID_TOKEN.some((type) => error instanceof type)
      ? ("invalid" as const)
      : ("unavailable" as const);
  }
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
    if (response.status !== 200)
      return ENDED_CONNECTION.has(errorCode(body))
        ? ("ended" as const)
        : ("unavailable" as const);
    const { email, email_confirmed_at, identities, id } = authUser.parse(body);
    return {
      id,
      email: email ?? undefined,
      email_confirmed_at: email_confirmed_at ?? undefined,
      identities: identities ?? undefined,
    };
  } catch {
    return "unavailable" as const;
  }
}

function errorCode(body: unknown): string {
  return body && typeof body === "object" && "error_code" in body
    ? String(body.error_code)
    : "";
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
