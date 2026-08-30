import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);

export function buildContentSecurityPolicy(
  nonce: string,
  environment: string | undefined,
): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      environment === "development" ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "worker-src 'self' blob:",
    ...(environment === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export default async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV,
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const requestWithNonce = new NextRequest(request, { headers: requestHeaders });
  const response = await updateSession(
    requestWithNonce,
    handleI18nRouting(requestWithNonce),
  );
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: "/((?!api|auth|_next|_vercel|.*\\..*).*)",
};
