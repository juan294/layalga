import { createHmac, randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  sql: vi.fn(),
  cookies: new Map<string, string>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookies.has(name)
        ? { name, value: mocks.cookies.get(name) }
        : undefined,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  }),
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ sql: mocks.sql }),
}));

import { getCurrentHost } from "./current-host";

describe("getCurrentHost", () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.sql.mockReset();
    mocks.cookies.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores a leftover demo host cookie without a Supabase user", async () => {
    const secret = "abcdef0123456789abcdef0123456789";
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DEMO_SESSION_SECRET", secret);
    mocks.cookies.set("layalga_demo_host", signedDemoHostCookie(secret));
    // A demo-era lookup would find this host if the cookie were still read.
    mocks.sql.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000201",
        home_id: "00000000-0000-4000-8000-000000000001",
        display_name: "Host",
        locale: "en",
        demo: true,
      },
    ]);

    await expect(getCurrentHost()).resolves.toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("resolves the host bound to the signed-in Supabase user", async () => {
    mocks.user = { id: "user-1" };
    mocks.sql.mockResolvedValue([
      {
        id: "host-1",
        home_id: "home-1",
        display_name: "Host",
        locale: "en",
        timezone: "Europe/Madrid",
      },
    ]);

    await expect(getCurrentHost()).resolves.toEqual({
      id: "host-1",
      homeId: "home-1",
      displayName: "Host",
      locale: "en",
      timeZone: "Europe/Madrid",
    });
  });
});

/** The retired `layalga_demo_host` format: `v1.<payload>.<HMAC-SHA256>`. */
function signedDemoHostCookie(secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      hostId: "00000000-0000-4000-8000-000000000201",
      sessionId: randomUUID(),
      expiresAt: Date.now() + 3_600_000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`v1.${payload}`)
    .digest("base64url");
  return `v1.${payload}.${signature}`;
}
