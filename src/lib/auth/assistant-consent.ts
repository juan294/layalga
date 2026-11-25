import "@/core/server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  listAllowlistedClients,
  type AssistantName,
} from "@/core/assistant-access/clients";
import type { DatabaseClient } from "@/core/db/client";
import { reportActionError } from "@/lib/server/action-errors";

import { isHostAccount } from "./host-account";
import { oauthServerFailure } from "./oauth-server-errors";
import { isAssistantConsentPath } from "./safe-next-path";
import { lookUpSessionUser } from "./session-user";
import { verifiedGoogleGuestEmail } from "./verified-guest-email";

export type ConsentDecision = "allow" | "deny";

export type ConsentState =
  | {
      status:
        | "off"
        | "invalid"
        | "sign_in"
        | "host"
        | "not_allowed"
        | "ended"
        | "unavailable";
    }
  | { status: "start"; email: string }
  | {
      status: "review";
      email: string;
      assistant: AssistantName;
      domain: string;
      /** Requested scopes beyond sign-in and refresh. */
      scopes: string[];
    }
  /** An earlier consent. Only the guest may follow this URL. */
  | { status: "continue"; assistant: AssistantName; url: string }
  /** The answer to the decision that the guest just made. */
  | { status: "redirect"; assistant: AssistantName; url: string };

export interface ConsentDeps {
  enabled: boolean;
  database: DatabaseClient;
  supabase: Pick<SupabaseClient, "auth">;
}

const BASIC_SCOPES = new Set(["openid", "offline_access"]);

/**
 * Everything a page load may decide. Reading the request binds it to this
 * account and approves it when the guest consented earlier, so a load stops
 * before that read.
 */
export function startConsent(
  authorizationId: unknown,
  deps: ConsentDeps,
): Promise<ConsentState> {
  return guarded(async () => {
    const guest = await consentGuest(authorizationId, deps);
    return guest.status === "ok"
      ? { status: "start", email: guest.email }
      : guest;
  });
}

/** The request itself, after the guest chose to continue. */
export function reviewConsent(
  authorizationId: unknown,
  deps: ConsentDeps,
): Promise<ConsentState> {
  return guarded(async () => {
    const request = await consentRequest(authorizationId, deps);
    if (request.status !== "ok") return request;
    const { email, assistant, redirectUri, scopes } = request;
    return {
      status: "review",
      email,
      assistant,
      domain: new URL(redirectUri).host,
      scopes: scopes.filter((scope) => !BASIC_SCOPES.has(scope)),
    };
  });
}

/** Repeats every check, then answers the assistant. */
export function decideConsent(
  authorizationId: unknown,
  decision: unknown,
  deps: ConsentDeps,
): Promise<ConsentState> {
  return guarded(async () => {
    if (decision !== "allow" && decision !== "deny")
      return { status: "invalid" };
    const request = await consentRequest(authorizationId, deps);
    if (request.status !== "ok") return request;
    const { oauth } = deps.supabase.auth;
    const answer = decision === "allow" ? "approve" : "deny";
    const { data, error } = await oauth[`${answer}Authorization`](
      request.authorizationId,
      { skipBrowserRedirect: true },
    );
    if (error) return { status: oauthServerFailure(error) };
    return returnsTo(data.redirect_url, request.redirectUri)
      ? {
          status: "redirect",
          assistant: request.assistant,
          url: data.redirect_url,
        }
      : { status: "not_allowed" };
  });
}

async function consentGuest(authorizationId: unknown, deps: ConsentDeps) {
  if (!deps.enabled) return { status: "off" } as const;
  if (
    typeof authorizationId !== "string" ||
    !isAssistantConsentPath(
      `/en/oauth/consent?authorization_id=${authorizationId}`,
    )
  )
    return { status: "invalid" } as const;
  const session = await lookUpSessionUser(deps.supabase);
  if (session.status === "unavailable")
    return { status: "unavailable" } as const;
  const user: User | null =
    session.status === "signed_in" ? session.user : null;
  const email = verifiedGoogleGuestEmail(user);
  if (!user || !email) return { status: "sign_in" } as const;
  if (await isHostAccount(deps.database, user.id, email))
    return { status: "host" } as const;
  return { status: "ok", authorizationId, email } as const;
}

async function consentRequest(rawId: unknown, deps: ConsentDeps) {
  const guest = await consentGuest(rawId, deps);
  if (guest.status !== "ok") return guest;
  const { authorizationId, email } = guest;
  const { data, error } =
    await deps.supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error) return { status: oauthServerFailure(error) } as const;

  const allowed = (await listAllowlistedClients(deps.database)).filter(
    (client) => client.enabled,
  );
  if (!("authorization_id" in data)) {
    // An earlier consent names no client, so its callback identifies it.
    const url = data.redirect_url;
    const client = allowed.find(({ redirectUri }) =>
      returnsTo(url, redirectUri),
    );
    return client
      ? ({ status: "continue", assistant: client.assistant, url } as const)
      : ({ status: "not_allowed" } as const);
  }
  const client = allowed.find(
    ({ clientId, redirectUri }) =>
      clientId === data.client.id && redirectUri === data.redirect_uri,
  );
  if (!client) return { status: "not_allowed" } as const;
  return {
    status: "ok",
    authorizationId,
    email,
    assistant: client.assistant,
    redirectUri: client.redirectUri,
    scopes: data.scope.split(" ").filter(Boolean),
  } as const;
}

/** The allowlist holds no query or fragment, so the prefix fixes origin and path. */
function returnsTo(url: string, redirectUri: string): boolean {
  return url.startsWith(`${redirectUri}?`);
}

async function guarded(
  decide: () => Promise<ConsentState>,
): Promise<ConsentState> {
  try {
    return await decide();
  } catch (error) {
    reportActionError("assistant_consent_failed", error);
    return { status: "unavailable" };
  }
}
