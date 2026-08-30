import { describe, expect, test } from "vitest";

import nextConfig, { buildSecurityHeaders } from "./next.config";

describe("content security policy", () => {
  test("keeps the browser defense-in-depth baseline", () => {
    const headers = new Map(
      buildSecurityHeaders("production").map(({ key, value }) => [
        key.toLowerCase(),
        value,
      ]),
    );

    expect(headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers.get("content-security-policy")).toContain(
      "https://*.supabase.co",
    );
    expect(headers.get("content-security-policy")).not.toContain(
      "'unsafe-eval'",
    );
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("permissions-policy")).toContain("camera=()");
  });

  test("observes a strict production script policy before enforcement", () => {
    const securityHeaders = buildSecurityHeaders("production");
    const enforced = securityHeaders.find(
      (header) => header.key === "Content-Security-Policy",
    );
    const reportOnly = securityHeaders.find(
      (header) => header.key === "Content-Security-Policy-Report-Only",
    );

    expect(enforced?.value).toContain("script-src 'self' 'unsafe-inline'");
    expect(reportOnly?.value).toContain("script-src 'self'");
    expect(
      reportOnly?.value.match(/script-src[^;]*/)?.[0],
    ).not.toContain("'unsafe-inline'");
    expect(reportOnly?.value).toContain(
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    );
    expect(nextConfig.experimental?.sri).toEqual({ algorithm: "sha256" });
  });
});
