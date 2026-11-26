import { afterEach, beforeEach, expect, it, vi } from "vitest";

import nextConfig from "../../../../../next.config";
import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://layalga.example/");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
});
afterEach(() => vi.unstubAllEnvs());

it("describes the endpoint and its one authorization server", async () => {
  vi.stubEnv("ASSISTANT_ACCESS", "on");
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("public, max-age=300");
  expect(await response.json()).toStrictEqual({
    resource: "https://layalga.example/api/mcp",
    authorization_servers: ["https://project.supabase.co/auth/v1"],
    scopes_supported: ["openid"],
    bearer_methods_supported: ["header"],
    resource_name: "L’Ayalga",
    resource_documentation: "https://layalga.example/en/privacy",
  });
});

it.each([undefined, "none", "true"])(
  "answers 404 while ASSISTANT_ACCESS is %s",
  async (value) => {
    vi.stubEnv("ASSISTANT_ACCESS", value);
    const response = await GET();
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("authorization_servers");
  },
);

it("serves both discovery locations from this route", async () => {
  expect(await nextConfig.rewrites!()).toStrictEqual([
    {
      source: "/.well-known/oauth-protected-resource",
      destination: "/api/mcp/metadata",
    },
    {
      source: "/.well-known/oauth-protected-resource/api/mcp",
      destination: "/api/mcp/metadata",
    },
  ]);
});
