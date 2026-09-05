import { type NextRequest, NextResponse } from "next/server";
import { setGuestEmailSession } from "@/lib/auth/guest-email-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "es")
    return new NextResponse(null, { status: 404 });
  const authority = await setGuestEmailSession(
    request.nextUrl.searchParams.get("capability") ?? "",
  );
  // Relative Location preserves the browser's cookie origin even when the
  // framework's internal request URL uses a different host behind a proxy.
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      location: authority
        ? `/${authority.locale}/guest`
        : `/${locale}/guest/verify?invalid=1`,
    },
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
