import {
  isAuthSessionMissingError,
  type AuthError,
} from "@supabase/supabase-js";

type OAuthServerFailure = "off" | "sign_in" | "ended" | "unavailable";

/** Auth answers these for an unknown, expired, used or foreign request. */
const ENDED_REQUEST = new Set([
  "oauth_authorization_not_found",
  "oauth_client_not_found",
  "validation_failed",
]);

/** What a failed call to the OAuth server means for the guest. */
export function oauthServerFailure(error: AuthError): OAuthServerFailure {
  // Auth reports a switched-off server with the status of an unknown request.
  if (error.code === "feature_disabled") return "off";
  if (
    isAuthSessionMissingError(error) ||
    error.status === 401 ||
    error.status === 403
  )
    return "sign_in";
  return ENDED_REQUEST.has(error.code ?? "") ? "ended" : "unavailable";
}
