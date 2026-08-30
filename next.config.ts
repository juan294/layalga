import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

function createContentSecurityPolicy(
  environment: string | undefined,
  reportOnly: boolean,
): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self'${reportOnly ? "" : " 'unsafe-inline'"}${
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

export function buildSecurityHeaders(environment: string | undefined) {
  const headers = [
    {
      key: "Content-Security-Policy",
      value: createContentSecurityPolicy(environment, false),
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];

  if (environment === "production") {
    headers.push({
      key: "Content-Security-Policy-Report-Only",
      value: createContentSecurityPolicy(environment, true),
    });
  }

  return headers;
}

export const securityHeaders = buildSecurityHeaders(process.env.NODE_ENV);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    sri: {
      algorithm: "sha256",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
