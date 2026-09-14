import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
}));

vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ sql: mocks.sql }),
}));

import {
  DEMO_HOST_COOKIE,
  DEMO_HOST_MAX_AGE,
  readDemoHostCookie,
} from "@/lib/auth/demo-session";

import { POST } from "./route";

const hostId = "00000000-0000-4000-8000-000000000201";
const secret = "a-secure-demo-session-secret-with-32-bytes";

describe("POST /[locale]/demo-enter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DEMO_SESSION_SECRET", secret);
    mocks.sql.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("records a host review session and sets its signed cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.sql.mockResolvedValueOnce([{ id: hostId }]).mockResolvedValueOnce([]);

    const response = await post("en", { hostId });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/en");
    expect(mocks.sql).toHaveBeenCalledTimes(2);
    expect(queryText(1)).toContain("insert into private.review_access_events");
    expect(mocks.sql.mock.calls[1]?.slice(1)).toEqual([
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      "host",
      "en",
    ]);
    const cookie = response.cookies.get(DEMO_HOST_COOKIE);
    expect(readDemoHostCookie(cookie?.value, { secret })).toBe(hostId);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain(
      `Max-Age=${DEMO_HOST_MAX_AGE}`,
    );
  });

  it("does not record automated release-probe entry", async () => {
    mocks.sql.mockResolvedValueOnce([{ id: hostId }]);

    const response = await post(
      "es",
      { hostId },
      { "x-layalga-automated-review": "1" },
    );

    expect(response.status).toBe(303);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
});

async function post(
  locale: string,
  values: Record<string, string>,
  headers?: Record<string, string>,
): Promise<NextResponse> {
  return POST(
    new NextRequest(`http://localhost:3008/${locale}/demo-enter`, {
      body: new URLSearchParams(values),
      headers,
      method: "POST",
    }),
    { params: Promise.resolve({ locale }) },
  );
}

function queryText(callIndex: number): string {
  const query = mocks.sql.mock.calls[callIndex]?.[0] as
    TemplateStringsArray | undefined;
  return query?.join(" ") ?? "";
}
