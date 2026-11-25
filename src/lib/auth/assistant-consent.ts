import "@/core/server-only";

import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

import {
  listEnabledClients,
  type AssistantName,
} from "@/core/assistant-access/clients";
import type { DatabaseClient } from "@/core/db/client";
import { reportActionError } from "@/lib/server/action-errors";

import { googleGuest } from "./google-guest";
import { isHostAccount } from "./host-account";
import { oauthServerFailure } from "./oauth-server-errors";
import { isAuthorizationId } from "./safe-next-path";
import { lookUpSessionUser, type SessionLookup } from "./session-user";

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
  /**
   * `continue` is an earlier consent: only the guest may follow the URL.
   * `redirect` answers the decision that the guest just made.
   */
  | {
      status: "continue" | "redirect";
      email: string;
      assistant: AssistantName;
      url: string;
    };

export interface ConsentDeps {
  enabled: boolean;
  database: DatabaseClient;
  supabase: Pick<SupabaseClient, "auth">;
  /** The lookup that a rendered page already made. An action makes its own. */
  session?: () => Promise<SessionLookup>;
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

/** The request itself, after the guest chose to continue with the shown account. */
export function reviewConsent(
  authorizationId: unknown,
  shownEmail: unknown,
  deps: ConsentDeps,
): Promise<ConsentState> {
  return guarded(async () => {
    const guest = await consentGuest(authorizationId, deps);
    if (guest.status !== "ok") return guest;
    // The account can change behind an open page.
    if (guest.email !== shownEmail)
      return { status: "start", email: guest.email };
    const request = await consentRequest(guest, deps);
    if (request.status !== "ok") return request;
    const { email, assistant, redirectUri, scopes } = request;
    return {
      status: "review",
      email,
      assistant,
      domain: new URL(redirectUri).host,
      scopes,
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
    const guest = await consentGuest(authorizationId, deps);
    if (guest.status !== "ok") return guest;
    const request = await consentRequest(guest, deps);
    if (request.status !== "ok") return request;
    const { oauth } = deps.supabase.auth;
    const options = { skipBrowserRedirect: true };
    const { data, error } = await (decision === "allow"
      ? oauth.approveAuthorization(request.authorizationId, options)
      : oauth.denyAuthorization(request.authorizationId, options));
    if (error) return failure(error);
    return returnsTo(data.redirect_url, request.redirectUri)
      ? {
          status: "redirect",
          email: request.email,
          assistant: request.assistant,
          url: data.redirect_url,
        }
      : { status: "not_allowed" };
  });
}

async function consentGuest(authorizationId: unknown, deps: ConsentDeps) {
  if (!deps.enabled) return { status: "off" } as const;
  if (!isAuthorizationId(authorizationId))
    return { status: "invalid" } as const;
  const guest = googleGuest(
    await (deps.session?.() ?? lookUpSessionUser(deps.supabase)),
  );
  if (guest.status !== "ok") return guest;
  const { userId, email } = guest;
  if (await isHostAccount(deps.database, userId, email))
    return { status: "host" } as const;
  return { status: "ok", authorizationId, email } as const;
}

/** Auth refuses a request that is bound to another account. */
async function consentRequest(
  { authorizationId, email }: { authorizationId: string; email: string },
  deps: ConsentDeps,
) {
  const { data, error } =
    await deps.supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error) return failure(error);

  const allowed = await listEnabledClients(deps.database);
  if (!("authorization_id" in data)) {
    // An earlier consent names no client, so its callback identifies it.
    const url = data.redirect_url;
    const client = allowed.find(({ redirectUri }) =>
      returnsTo(url, redirectUri),
    );
    return client
      ? ({
          status: "continue",
          email,
          assistant: client.assistant,
          url,
        } as const)
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
    scopes: data.scope
      .split(" ")
      .filter((scope) => scope && !BASIC_SCOPES.has(scope)),
  } as const;
}

function failure(error: AuthError) {
  const status = oauthServerFailure(error);
  if (status === "unavailable")
    reportActionError("assistant_consent_failed", error);
  return { status };
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
