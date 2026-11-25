import "@/core/server-only";

import {
  AuthUnknownError,
  isAuthApiError,
  isAuthRetryableFetchError,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

type AuthClient = Pick<SupabaseClient, "auth">;

export type SessionLookup =
  | { status: "signed_in"; user: User }
  | { status: "signed_out" }
  | { status: "unavailable" };

/**
 * The verified user of a direct web sign-in. Supabase `getUser()` also accepts
 * access tokens issued to connected OAuth clients, so a third-party client
 * could place its token in a session cookie. Those tokens carry `client_id`.
 */
export async function getSessionUser(
  supabase: AuthClient,
): Promise<User | null> {
  const session = await lookUpSessionUser(supabase);
  return session.status === "signed_in" ? session.user : null;
}

/** The same check for a page that must not call a guest signed out while Auth is down. */
export async function lookUpSessionUser(
  supabase: AuthClient,
): Promise<SessionLookup> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (!user) return noSession(userError);
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return noSession(claimsError);
  const direct =
    claims.sub === user.id &&
    !("client_id" in claims) &&
    [claims.aud].flat().includes("authenticated");
  return direct ? { status: "signed_in", user } : { status: "signed_out" };
}

function noSession(error: unknown): SessionLookup {
  return { status: authIsDown(error) ? "unavailable" : "signed_out" };
}

/** A failure of the sign-in service or its gateway, not an answer about this session. */
function authIsDown(error: unknown): boolean {
  return (
    isAuthRetryableFetchError(error) ||
    error instanceof AuthUnknownError ||
    (isAuthApiError(error) && error.status === 429)
  );
}
