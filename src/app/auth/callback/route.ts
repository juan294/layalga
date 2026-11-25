import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { claimHostForUser } from "@/lib/auth/current-host";
import {
  authRequestOrigin,
  clearOAuthNextCookie,
  oauthNextPath,
} from "@/lib/auth/oauth-next";
import {
  isAssistantConsentPath,
  isAssistantsPath,
  isRequesterPath,
  isStaySearchPath,
} from "@/lib/auth/safe-next-path";
import { verifiedGoogleGuestEmail } from "@/lib/auth/verified-guest-email";
import { claimPartyForUser } from "@/lib/auth/party-claim";
import { hasPartyForUser } from "@/lib/auth/guest-account";
import { getSessionUser } from "@/lib/auth/session-user";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = oauthNextPath(request);
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const user = await getSessionUser(supabase);
      if (user) {
        const redirectTo = (path: string) =>
          clearOAuthNextCookie(
            NextResponse.redirect(new URL(path, authRequestOrigin(request))),
          );
        const guestToken = guestTokenFromPath(next);
        const bookingReturn = isStaySearchPath(next);
        // An assistant flow never binds a prepared host to this account.
        if (retriesInPlace(next) || bookingReturn) {
          if (verifiedGoogleGuestEmail(user)) {
            // A pre-provisioned host can enter from the stay finder and open their dashboard later.
            if (bookingReturn) await claimHostForUser(user);
            return redirectTo(next);
          }
        } else if (guestToken) {
          if (await claimPartyForUser(guestToken, user.id)) {
            return redirectTo(next);
          }
        } else {
          if (!guestAccountPath(next) && (await claimHostForUser(user))) {
            return redirectTo(next);
          }
          // A guest who claimed an invitation earlier signs in from any
          // page except an invitation link; their visits page is their home.
          if (await hasPartyForUser(user.id)) {
            return redirectTo(`/${localeOf(next)}/visits`);
          }
          if (next === `/${localeOf(next)}` && verifiedGoogleGuestEmail(user)) {
            return redirectTo(`/${localeOf(next)}/stays`);
          }
        }
      }
      // Only this sign-in failed; keep the account's other sessions.
      await supabase.auth.signOut({ scope: "local" });
      if (retriesInPlace(next)) return failedSignInPlace(request, next);
      if (guestTokenFromPath(next)) {
        const failed = new URL(next, authRequestOrigin(request));
        failed.searchParams.set("claim", "failed");
        return clearOAuthNextCookie(NextResponse.redirect(failed));
      }
      if (guestAccountPath(next)) {
        const failed = new URL(next, authRequestOrigin(request));
        failed.searchParams.set("account", "not_found");
        return clearOAuthNextCookie(NextResponse.redirect(failed));
      }
      return clearOAuthNextCookie(signInRedirect(request, next, "not_a_host"));
    }
  }

  if (retriesInPlace(next)) return failedSignInPlace(request, next);
  return clearOAuthNextCookie(signInRedirect(request, next, "oauth_failed"));
}

/** Pages that any verified Google guest can open and that offer their own retry. */
function retriesInPlace(next: string): boolean {
  return (
    isRequesterPath(next) ||
    isAssistantConsentPath(next) ||
    isAssistantsPath(next)
  );
}

function failedSignInPlace(request: NextRequest, next: string) {
  const retry = new URL(next, authRequestOrigin(request));
  retry.searchParams.set("auth", "failed");
  return clearOAuthNextCookie(NextResponse.redirect(retry));
}

function guestAccountPath(value: string): boolean {
  return /^\/(?:en|es)\/visits$/.test(value);
}

function guestTokenFromPath(value: string): string | null {
  return value.match(/^\/(?:en|es)\/g\/([A-Za-z0-9_-]{43})$/)?.[1] ?? null;
}

function signInRedirect(
  request: NextRequest,
  next: string,
  error: "not_a_host" | "oauth_failed",
): NextResponse {
  const url = new URL(`/${localeOf(next)}/sign-in`, authRequestOrigin(request));
  const bookingReturn = isStaySearchPath(next);
  url.searchParams.set("error", bookingReturn ? "oauth_failed" : error);
  if (bookingReturn) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

function localeOf(next: string): string {
  const locale = next.split("/")[1];
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}
