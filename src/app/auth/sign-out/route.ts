import { NextResponse, type NextRequest } from "next/server";

import { DRAFT_BROWSER_COOKIE } from "@/lib/auth/stay-request-draft";
import { authRequestOrigin } from "@/lib/auth/oauth-next";
import { GUEST_EMAIL_COOKIE } from "@/lib/auth/guest-email-cookie";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (request.headers.get("origin") !== authRequestOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const locale = form.get("locale") === "es" ? "es" : "en";
  const supabase = await createClient();
  // Signing out of this device must not depend on the sign-in service. Only the
  // server-side revocation can fail, so the cookies are removed in every case.
  const revoked = await supabase.auth.signOut({ scope: "local" }).then(
    ({ error }) => !error,
    () => false,
  );
  if (!revoked) console.error("[SIGN_OUT_REVOKE_FAILED]");

  const response = NextResponse.redirect(
    new URL(`/${locale}/sign-in`, authRequestOrigin(request)),
    303,
  );
  const sessionCookies = request.cookies
    .getAll()
    .map(({ name }) => name)
    .filter((name) => /^sb-.+-auth-token/.test(name));
  for (const name of [
    GUEST_EMAIL_COOKIE,
    DRAFT_BROWSER_COOKIE,
    ...sessionCookies,
  ])
    response.cookies.set(name, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  return response;
}
