import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DELETE, GET, POST } from "./route";

const URL = "http://127.0.0.1:3048/api/mcp";

beforeEach(() => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3048");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
  vi.stubEnv("DATABASE_URL", "postgresql://nobody@127.0.0.1:1/none");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const request = (method: string) =>
  new Request(URL, {
    method,
    headers: { "content-type": "application/json" },
    body:
      method === "POST"
        ? '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
        : undefined,
  });

it.each([undefined, "none", "On"])(
  "answers every method with 404 while ASSISTANT_ACCESS is %s",
  async (value) => {
    vi.stubEnv("ASSISTANT_ACCESS", value);
    for (const [name, handler] of [
      ["GET", GET],
      ["POST", POST],
      ["DELETE", DELETE],
    ] as const) {
      const response = await handler(request(name));
      expect(response.status, name).toBe(404);
      expect(response.headers.get("www-authenticate")).toBeNull();
    }
    expect(console.info).not.toHaveBeenCalled();
  },
);

it("serves the endpoint once ASSISTANT_ACCESS is on", async () => {
  vi.stubEnv("ASSISTANT_ACCESS", "on");
  expect((await GET(request("GET"))).status).toBe(405);
  expect((await DELETE(request("DELETE"))).status).toBe(405);
  // No token: the live resolver refuses before it reads anything.
  const response = await POST(request("POST"));
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toMatch(
    /^Bearer resource_metadata="http:\/\/127\.0\.0\.1:3048\/\.well-known\/oauth-protected-resource\/api\/mcp"/,
  );
});
