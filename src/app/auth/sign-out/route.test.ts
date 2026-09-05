import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const signOut = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser, signOut } })),
}));

import { DEMO_HOST_COOKIE, DEMO_GUEST_COOKIE } from "@/lib/auth/demo-session";
import { GUEST_EMAIL_COOKIE } from "@/lib/auth/guest-email-cookie";

import { POST } from "./route";

describe("POST /auth/sign-out", () => {
  beforeEach(() => {
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  test("signs out only this session and clears the demo host cookie", async () => {
    const response = await POST(request("http://localhost:3008", "es"));

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3008/es/sign-in",
    );
    expect(response.cookies.get(DEMO_HOST_COOKIE)?.value).toBe("");
  });

  test("rejects a cross-origin request before changing the session", async () => {
    const response = await POST(request("https://evil.example", "en"));

    expect(response.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
    expect(response.cookies.get(GUEST_EMAIL_COOKIE)).toBeUndefined();
  });

  test("ends email and demo guest authority even without a Google session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(request("http://localhost:3008", "en"));

    expect(signOut).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    for (const cookie of [
      GUEST_EMAIL_COOKIE,
      DEMO_GUEST_COOKIE,
      DEMO_HOST_COOKIE,
    ]) {
      expect(response.cookies.get(cookie)).toMatchObject({
        value: "",
        maxAge: 0,
        path: "/",
        httpOnly: true,
      });
    }
  });

  test("clears all guest capabilities after successful Google sign-out", async () => {
    const response = await POST(request("http://localhost:3008", "es"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.cookies.get(GUEST_EMAIL_COOKIE)).toMatchObject({
      value: "",
      maxAge: 0,
    });
    expect(response.cookies.get(DEMO_GUEST_COOKIE)).toMatchObject({
      value: "",
      maxAge: 0,
    });
  });
});

function request(origin: string, locale: string): NextRequest {
  return new NextRequest("http://localhost:3008/auth/sign-out", {
    body: new URLSearchParams({ locale }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
    method: "POST",
  });
}
