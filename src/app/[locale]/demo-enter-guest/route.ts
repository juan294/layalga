import { hasLocale } from "next-intl";
import { type NextRequest, NextResponse } from "next/server";

import { getDatabaseConnection } from "@/core/db/client";
import { routing } from "@/i18n/routing";
import { GUEST_EMAIL_COOKIE } from "@/lib/auth/guest-email-cookie";
import {
  createDemoGuestCookie,
  DEMO_GUEST_COOKIE,
  DEMO_GUEST_MAX_AGE,
} from "@/lib/auth/demo-session";

interface DemoEnterGuestContext {
  params: Promise<{ locale: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: DemoEnterGuestContext,
): Promise<NextResponse> {
  const { locale } = await params;
  if (process.env.DEMO_MODE !== "true" || !hasLocale(routing.locales, locale)) {
    return new NextResponse(null, { status: 404 });
  }

  const form = await request.formData();
  const invitationId = form.get("invitationId");
  if (typeof invitationId !== "string") {
    return new NextResponse(null, { status: 400 });
  }

  const sql = getDatabaseConnection().sql;
  const [invitation] = await sql<{ id: string }[]>`
    select invitation.id
    from public.invitations as invitation
    join public.homes as home on home.id = invitation.home_id
    where invitation.id = ${invitationId}
      and invitation.status <> 'cancelled'
      and home.demo = true
  `;
  if (!invitation) return new NextResponse(null, { status: 404 });

  const response = new NextResponse(null, {
    status: 303,
    headers: { location: `/${locale}/guest` },
  });
  response.cookies.delete(GUEST_EMAIL_COOKIE);
  response.cookies.set(
    DEMO_GUEST_COOKIE,
    createDemoGuestCookie(invitation.id),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DEMO_GUEST_MAX_AGE,
    },
  );
  return response;
}
