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
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
