import { beforeEach, describe, expect, test, vi } from "vitest";

import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  handleI18nRouting: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("next-intl/middleware", () => ({
  default: () => mocks.handleI18nRouting,
}));

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: mocks.updateSession,
}));

import proxy, { buildContentSecurityPolicy } from "./proxy";

describe("nonce content security policy", () => {
  beforeEach(() => {
    mocks.handleI18nRouting.mockReset();
    mocks.updateSession.mockReset();

    mocks.handleI18nRouting.mockImplementation((request: NextRequest) => {
      const response = NextResponse.rewrite(new URL("/en", request.url), {
        request: { headers: request.headers },
      });
      response.cookies.set("NEXT_LOCALE", "en");
      return response;
    });
    mocks.updateSession.mockImplementation(
      async (_request: NextRequest, response: NextResponse) => {
        response.cookies.set("session", "refreshed");
        return response;
      },
    );
  });

  test("uses a nonce without unsafe inline script execution in production", () => {
    const policy = buildContentSecurityPolicy("test-nonce", "production");
    const scriptPolicy = policy.match(/script-src[^;]*/)?.[0];

    expect(scriptPolicy).toContain("'nonce-test-nonce'");
    expect(scriptPolicy).toContain("'strict-dynamic'");
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
    expect(policy).toContain(
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    );
  });

  test("keeps React development diagnostics available", () => {
    const scriptPolicy = buildContentSecurityPolicy(
      "test-nonce",
      "development",
    ).match(/script-src[^;]*/)?.[0];

    expect(scriptPolicy).toContain("'nonce-test-nonce'");
    expect(scriptPolicy).toContain("'unsafe-eval'");
  });

  test("preserves routing and refreshed session cookies", async () => {
    const request = new NextRequest("https://layalga.example/");
    const response = await proxy(request);
    const routedRequest = mocks.handleI18nRouting.mock.calls[0]?.[0] as
      | NextRequest
      | undefined;
    const refreshedRequest = mocks.updateSession.mock.calls[0]?.[0] as
      | NextRequest
      | undefined;

    expect(routedRequest).toBeInstanceOf(NextRequest);
    if (!routedRequest) throw new Error("i18n routing did not receive a request");
    expect(routedRequest.headers.get("x-nonce")).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(routedRequest.headers.get("content-security-policy")).toContain(
      `'nonce-${routedRequest.headers.get("x-nonce")}'`,
    );
    expect(refreshedRequest).toBe(routedRequest);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://layalga.example/en",
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'self' 'nonce-",
    );
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("en");
    expect(response.cookies.get("session")?.value).toBe("refreshed");
  });
});
