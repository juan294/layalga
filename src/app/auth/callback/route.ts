import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { claimHostForUser } from "@/lib/auth/current-host";
import { claimPartyForUser } from "@/lib/auth/party-claim";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const guestToken = guestTokenFromPath(next);
        if (guestToken && (await claimPartyForUser(guestToken, user.id))) {
          return NextResponse.redirect(new URL(next, request.url));
        }
        if (!guestToken && (await claimHostForUser(user))) {
          return NextResponse.redirect(new URL(next, request.url));
        }
      }
      await supabase.auth.signOut();
      if (guestTokenFromPath(next)) {
        const failed = new URL(next, request.url);
        failed.searchParams.set("claim", "failed");
        return NextResponse.redirect(failed);
      }
      return signInRedirect(request, next, "not_a_host");
    }
  }

  return signInRedirect(request, next, "oauth_failed");
}

function guestTokenFromPath(value: string): string | null {
  return value.match(/^\/(?:en|es)\/g\/([A-Za-z0-9_-]{43})$/)?.[1] ?? null;
}

function signInRedirect(
  request: NextRequest,
  next: string,
  error: "not_a_host" | "oauth_failed",
): NextResponse {
  const locale = next.split("/")[1];
  const safeLocale = routing.locales.includes(locale as "en" | "es")
    ? locale
    : routing.defaultLocale;
  return NextResponse.redirect(
    new URL(`/${safeLocale}/sign-in?error=${error}`, request.url),
  );
}
