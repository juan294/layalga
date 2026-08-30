import { describe, expect, test } from "vitest";

import nextConfig, { buildSecurityHeaders } from "./next.config";

describe("content security policy", () => {
  test("keeps the browser defense-in-depth baseline", () => {
    const headers = new Map(
      buildSecurityHeaders().map(({ key, value }) => [
        key.toLowerCase(),
        value,
      ]),
    );

    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("permissions-policy")).toContain("camera=()");
  });

  test("leaves the document CSP to the per-request nonce proxy", () => {
    expect(
      buildSecurityHeaders().some(({ key }) =>
        key.toLowerCase().startsWith("content-security-policy"),
      ),
    ).toBe(false);
    expect(nextConfig.experimental?.sri).toBeUndefined();
  });
});
