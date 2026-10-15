import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { claimHostForUser } from "@/lib/auth/current-host";
import { clearOAuthNextCookie, oauthNextPath } from "@/lib/auth/oauth-next";
import { claimPartyForUser } from "@/lib/auth/party-claim";
import { hasPartyForUser } from "@/lib/auth/guest-account";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = oauthNextPath(request);
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const redirectTo = (path: string) =>
          clearOAuthNextCookie(
            NextResponse.redirect(new URL(path, request.url)),
          );
        const guestToken = guestTokenFromPath(next);
        if (guestToken) {
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
        }
      }
      await supabase.auth.signOut();
      if (guestTokenFromPath(next)) {
        const failed = new URL(next, request.url);
        failed.searchParams.set("claim", "failed");
        return clearOAuthNextCookie(NextResponse.redirect(failed));
      }
      if (guestAccountPath(next)) {
        const failed = new URL(next, request.url);
        failed.searchParams.set("account", "not_found");
        return clearOAuthNextCookie(NextResponse.redirect(failed));
      }
      return clearOAuthNextCookie(signInRedirect(request, next, "not_a_host"));
    }
  }

  return clearOAuthNextCookie(signInRedirect(request, next, "oauth_failed"));
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
  return NextResponse.redirect(
    new URL(`/${localeOf(next)}/sign-in?error=${error}`, request.url),
  );
}

function localeOf(next: string): string {
  const locale = next.split("/")[1];
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}
