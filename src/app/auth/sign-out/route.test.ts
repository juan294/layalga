import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const signOut = vi.fn();
const log = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut } })),
}));

import { GUEST_EMAIL_COOKIE } from "@/lib/auth/guest-email-cookie";

import { POST } from "./route";

describe("POST /auth/sign-out", () => {
  beforeEach(() => {
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
    log.mockReset();
    vi.spyOn(console, "error").mockImplementation(log);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("signs out only this session and returns to sign-in", async () => {
    const response = await POST(request("http://localhost:3008", "es"));

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3008/es/sign-in",
    );
    expect(response.cookies.get("layalga_demo_host")).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  test("leaves no timer running after a normal sign-out", async () => {
    vi.useFakeTimers();
    await POST(request("http://localhost:3008", "en"));
    expect(vi.getTimerCount()).toBe(0);
  });

  test.each([
    "refresh_token_already_used",
    "refresh_token_not_found",
    "session_expired",
    "session_not_found",
    "user_not_found",
  ])("does not report a session that is already gone: %s", async (code) => {
    signOut.mockResolvedValue({ error: new AuthApiError("gone", 400, code) });
    const response = await POST(request("http://localhost:3008", "en"));

    expect(response.status).toBe(303);
    expect(log).not.toHaveBeenCalled();
  });

  test("expires only Supabase session cookies", async () => {
    const response = await POST(
      request(
        "http://localhost:3008",
        "en",
        "sb-ref-auth-token-flow-ab12-code-verifier=a; sb-ref-auth-tokenfoo=b; sb-a-auth-token,NEXT_LOCALE=c; layalga-sb-ref-auth-token=d",
      ),
    );
    expect(
      response.cookies
        .getAll()
        .map(({ name }) => name)
        .filter((name) => name.includes("auth-token")),
    ).toEqual(["sb-ref-auth-token-flow-ab12-code-verifier"]);
  });

  test("answers within seconds while revocation never completes", async () => {
    vi.useFakeTimers();
    signOut.mockReturnValue(new Promise(() => {}));
    const pending = POST(
      request("http://localhost:3008", "en", "sb-ref-auth-token=a"),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;

    expect(response.status).toBe(303);
    expect(response.cookies.get("sb-ref-auth-token")).toMatchObject({
      value: "",
      expires: new Date(0),
    });
    expect(log).toHaveBeenCalledExactlyOnceWith("[SIGN_OUT_REVOKE_FAILED]");
  });

  test("rejects a cross-origin request before changing the session", async () => {
    const response = await POST(request("https://evil.example", "en"));

    expect(response.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
    expect(response.cookies.get(GUEST_EMAIL_COOKIE)).toBeUndefined();
  });

  test("ends email guest authority even without a Google session", async () => {
    const response = await POST(request("http://localhost:3008", "en"));

    expect(response.status).toBe(303);
    expect(log).not.toHaveBeenCalled();
    expect(response.cookies.get(GUEST_EMAIL_COOKIE)).toMatchObject({
      value: "",
      expires: new Date(0),
      path: "/",
      httpOnly: true,
    });
  });

  test("clears all guest capabilities after successful Google sign-out", async () => {
    const response = await POST(request("http://localhost:3008", "es"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.cookies.get("layalga_request_browser")).toMatchObject({
      value: "",
      expires: new Date(0),
    });
    expect(response.cookies.get(GUEST_EMAIL_COOKIE)).toMatchObject({
      value: "",
      expires: new Date(0),
    });
  });

  test.each([
    [
      "returns an error",
      () => signOut.mockResolvedValue({ error: new Error("503") }),
    ],
    [
      "cannot be reached",
      () =>
        signOut.mockResolvedValue({
          error: new AuthRetryableFetchError("fetch failed", 0),
        }),
    ],
    [
      "is rate limited",
      () =>
        signOut.mockResolvedValue({
          error: new AuthApiError("slow down", 429, "over_request_rate_limit"),
        }),
    ],
    [
      "rejects the API key",
      () =>
        signOut.mockResolvedValue({
          error: new AuthApiError("Invalid API key", 401, undefined),
        }),
    ],
    ["throws", () => signOut.mockRejectedValue(new Error("network"))],
  ])("removes this device's session when Supabase %s", async (_, fail) => {
    fail();
    const response = await POST(
      request(
        "http://localhost:3008",
        "en",
        "sb-ref-auth-token.0=a; sb-ref-auth-token.1=b; sb-ref-auth-token-code-verifier=c; NEXT_LOCALE=en",
      ),
    );

    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(response.status).toBe(303);
    for (const name of [
      "sb-ref-auth-token.0",
      "sb-ref-auth-token.1",
      "sb-ref-auth-token-code-verifier",
    ])
      expect(response.cookies.get(name)).toMatchObject({
        value: "",
        expires: new Date(0),
        path: "/",
      });
    expect(response.cookies.get("NEXT_LOCALE")).toBeUndefined();
    expect(log).toHaveBeenCalledExactlyOnceWith("[SIGN_OUT_REVOKE_FAILED]");
  });
});

function request(origin: string, locale: string, cookie = ""): NextRequest {
  return new NextRequest("http://localhost:3008/auth/sign-out", {
    body: new URLSearchParams({ locale }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    method: "POST",
  });
}
