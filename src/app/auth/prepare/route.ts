import { NextResponse, type NextRequest } from "next/server";

import { OAUTH_NEXT_COOKIE } from "@/lib/auth/oauth-next";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let next = "/en";
  try {
    const body = (await request.json()) as { next?: unknown };
    next = safeNextPath(typeof body.next === "string" ? body.next : null);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(OAUTH_NEXT_COOKIE, next, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
