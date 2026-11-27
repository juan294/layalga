import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

export function buildSecurityHeaders() {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
}

export const securityHeaders = buildSecurityHeaders();

/**
 * Browser tests wait 5 s for a server action redirect, and a cold next dev
 * compiles the target inside that response. `tests/e2e/global-setup.ts`
 * compiles those pages first; next dev would drop them again after 60 s
 * without use (at most 5 kept), so the browser tests keep them for the run.
 */
export function developmentPageRetention(
  env: Record<string, string | undefined>,
): NextConfig["onDemandEntries"] {
  if (env.E2E_KEEP_COMPILED_PAGES !== "1") return undefined;
  return { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 1000 };
}

const nextConfig: NextConfig = {
  // Matches direct guest links, encoded guest return paths, capability queries
  // and assistant requests.
  logging: {
    incomingRequests: {
      ignore: [
        /(?:\/|%2f)g(?:\/|%2f)[^/?&#]+/i,
        /[?&](?:token|capability|authorization_id)=[^&]+/i,
      ],
    },
  },
  allowedDevOrigins: ["127.0.0.1"],
  onDemandEntries: developmentPageRetention(process.env),
  // Both discovery locations of the assistant endpoint (RFC 9728). A route
  // folder named `.well-known` would fall outside the type check.
  async rewrites() {
    return [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ].map((source) => ({ source, destination: "/api/mcp/metadata" }));
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
