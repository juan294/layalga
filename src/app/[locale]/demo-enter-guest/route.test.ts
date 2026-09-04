import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
}));

vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ sql: mocks.sql }),
}));

import {
  DEMO_GUEST_COOKIE,
  DEMO_GUEST_MAX_AGE,
  readDemoGuestCookie,
} from "@/lib/auth/demo-session";

import { POST } from "./route";

const invitationId = "00000000-0000-4000-8000-000000000402";
const secret = "a-secure-demo-session-secret-with-32-bytes";

describe("POST /[locale]/demo-enter-guest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DEMO_SESSION_SECRET", secret);
    mocks.sql.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 404 outside demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "false");

    const response = await post("en", { invitationId });

    expect(response.status).toBe(404);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("returns 404 for an unsupported locale", async () => {
    const response = await post("fr", { invitationId });

    expect(response.status).toBe(404);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("returns 400 when the invitation ID is missing", async () => {
    const response = await post("en", {});

    expect(response.status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("returns 400 when the invitation ID is not a string", async () => {
    const form = new FormData();
    form.set("invitationId", new File(["not-an-id"], "invitation.txt"));

    const response = await POST(request(form), {
      params: Promise.resolve({ locale: "en" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("returns 404 when the invitation is not attached to a demo home", async () => {
    const response = await post("en", { invitationId });

    expect(response.status).toBe(404);
    const query = mocks.sql.mock.calls[0]?.[0] as
      | TemplateStringsArray
      | undefined;
    expect(query?.join(" ")).toContain("home.demo = true");
  });

  it("does not mint a session for a cancelled invitation", async () => {
    const response = await post("en", { invitationId });

    expect(response.status).toBe(404);
    const query = mocks.sql.mock.calls[0]?.[0] as
      | TemplateStringsArray
      | undefined;
    expect(query?.join(" ")).toContain("invitation.status <> 'cancelled'");
  });

  it("sets the signed guest cookie and redirects to the guest route", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.sql.mockResolvedValue([{ id: invitationId }]);

    const response = await post("es", { invitationId });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/es/guest");
    const cookie = response.cookies.get(DEMO_GUEST_COOKIE);
    expect(readDemoGuestCookie(cookie?.value, { secret })).toBe(invitationId);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain(
      `Max-Age=${DEMO_GUEST_MAX_AGE}`,
    );
  });
});

async function post(
  locale: string,
  values: Record<string, string>,
): Promise<NextResponse> {
  return POST(request(new URLSearchParams(values)), {
    params: Promise.resolve({ locale }),
  });
}

function request(body: FormData | URLSearchParams): NextRequest {
  return new NextRequest("http://localhost:3008/en/demo-enter-guest", {
    body,
    method: "POST",
  });
}
