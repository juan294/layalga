import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const signOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut } })),
}));

import { GUEST_EMAIL_COOKIE } from "@/lib/auth/guest-email-cookie";

import { POST } from "./route";

describe("POST /auth/sign-out", () => {
  beforeEach(() => {
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
  });

  test("signs out only this session and returns to sign-in", async () => {
    const response = await POST(request("http://localhost:3008", "es"));

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3008/es/sign-in",
    );
    expect(response.cookies.get("layalga_demo_host")).toBeUndefined();
  });

  test("answers within seconds while revocation never completes", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
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
    log.mockRestore();
    vi.useRealTimers();
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
    ["throws", () => signOut.mockRejectedValue(new Error("network"))],
  ])("removes this device's session when Supabase %s", async (_, fail) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
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
    log.mockRestore();
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
