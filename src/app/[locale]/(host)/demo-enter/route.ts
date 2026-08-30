import { hasLocale } from "next-intl";
import { type NextRequest, NextResponse } from "next/server";

import { getDatabaseConnection } from "@/core/db/client";
import { routing } from "@/i18n/routing";
import {
  createDemoHostCookie,
  DEMO_HOST_COOKIE,
  DEMO_HOST_MAX_AGE,
} from "@/lib/auth/demo-session";

interface DemoEnterContext {
  params: Promise<{ locale: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: DemoEnterContext,
): Promise<NextResponse> {
  const { locale } = await params;
  if (process.env.DEMO_MODE !== "true" || !hasLocale(routing.locales, locale)) {
    return new NextResponse(null, { status: 404 });
  }

  const form = await request.formData();
  const hostId = form.get("hostId");
  if (typeof hostId !== "string") {
    return new NextResponse(null, { status: 400 });
  }

  const sql = getDatabaseConnection().sql;
  const [host] = await sql<{ id: string }[]>`
    select host.id
    from public.hosts as host
    join public.homes as home on home.id = host.home_id
    where host.id = ${hostId} and home.demo = true
  `;
  if (!host) return new NextResponse(null, { status: 404 });

  const response = new NextResponse(null, {
    status: 303,
    headers: { location: `/${locale}` },
  });
  response.cookies.set(DEMO_HOST_COOKIE, createDemoHostCookie(host.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEMO_HOST_MAX_AGE,
  });
  return response;
}
