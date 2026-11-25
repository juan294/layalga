import type { NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "./safe-next-path";

export const OAUTH_NEXT_COOKIE = "layalga_oauth_next";

export function oauthNextPath(request: NextRequest): string {
  return safeNextPath(
    request.cookies.get(OAUTH_NEXT_COOKIE)?.value ??
      request.nextUrl.searchParams.get("next"),
  );
}

export function clearOAuthNextCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(OAUTH_NEXT_COOKIE, "", {
    httpOnly: true,
    // Next.js drops Max-Age=0 when Supabase also writes cookies in this request.
    expires: new Date(0),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

/** Next can normalize a loopback URL. Keep the browser's configured origin
 * only when it matches the Host serving this request. */
export function authRequestOrigin(
  request: NextRequest,
  appUrl = process.env.APP_URL,
): string {
  if (appUrl && URL.canParse(appUrl)) {
    const configured = new URL(appUrl);
    if (request.headers.get("host") === configured.host)
      return configured.origin;
  }
  return request.nextUrl.origin;
}
