import { NextResponse, type NextRequest } from "next/server";

import { DEMO_HOST_COOKIE, DEMO_GUEST_COOKIE } from "@/lib/auth/demo-session";
import { GUEST_EMAIL_COOKIE } from "@/lib/auth/guest-email-cookie";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const locale = form.get("locale") === "es" ? "es" : "en";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      return NextResponse.json({ error: "sign_out_failed" }, { status: 500 });
    }
  }

  const response = NextResponse.redirect(
    new URL(`/${locale}/sign-in`, request.url),
    303,
  );
  for (const cookie of [
    DEMO_HOST_COOKIE,
    DEMO_GUEST_COOKIE,
    GUEST_EMAIL_COOKIE,
  ]) {
    response.cookies.set(cookie, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}
