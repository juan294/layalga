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

test("omits capability-bearing requests from development request logs and keeps ordinary routes visible", () => {
  const incoming = nextConfig.logging && nextConfig.logging.incomingRequests;
  const ignored = typeof incoming === "object" ? incoming.ignore : [];
  const matches = (path: string) =>
    ignored?.some((pattern) => pattern.test(path)) ?? false;
  for (const path of [
    "/es/g/sample-bearer",
    "/en/g/sample-bearer?x=1",
    "/en/runs/run/status?returnTo=%2Fen%2Fg%2Fsample-bearer",
    "/api/runs/run?token=sample-bearer",
    "/en/guest/verify?capability=verification",
    "/es/guest/return?capability=email",
    "/oauth/consent?authorization_id=pending",
    "/es/oauth/consent?authorization_id=pending&auth=failed",
    "/en/oauth/consent?auth=failed&authorization_id=pending",
  ])
    expect(matches(path), path).toBe(true);
  for (const path of [
    "/en",
    "/en/guests",
    "/es/runs/run/status?returnTo=%2Fes",
    "/api/runs/run",
    "/en/guest/verify?invalid=1",
    "/en/oauth/consent",
  ])
    expect(matches(path), path).toBe(false);
});
