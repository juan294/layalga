import { describe, expect, it } from "vitest";

import { securityHeaders } from "./next.config";

describe("browser security headers", () => {
  it("sets the browser defense-in-depth baseline", () => {
    const headers = new Map(
      securityHeaders.map(({ key, value }) => [key.toLowerCase(), value]),
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
});
