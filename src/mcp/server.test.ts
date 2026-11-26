import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssistantAccess } from "@/lib/auth/assistant-bearer";

import { serveMcp, type McpDeps } from "./server";

const APP = "http://127.0.0.1:3048";
const CHALLENGE = `Bearer resource_metadata="${APP}/.well-known/oauth-protected-resource/api/mcp", scope="openid"`;
const MODERN = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {},
};
const ok: AssistantAccess = {
  status: "ok",
  principal: {
    userId: "7b1f2c9e-60f4-4a6a-9b53-0f6f6f0a2c11",
    clientId: "2f1a3c5d-9f2e-4b63-8b0e-5a4c3d2e1f00",
    assistant: "claude",
  },
};

const resolve = vi.fn<McpDeps["resolve"]>();
const deps: McpDeps = { appUrl: APP, resolve };

beforeEach(() => {
  resolve.mockReset().mockResolvedValue(ok);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const rpc = (method: string, params: Record<string, unknown> = {}, id = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  params: { ...params, _meta: MODERN },
});

const isMessage = (
  body: unknown,
): body is { method: string; params?: { name?: unknown } } =>
  typeof body === "object" &&
  body !== null &&
  typeof (body as { method?: unknown }).method === "string";

function post(
  body: unknown,
  headers: Record<string, string> = {},
  method = "POST",
) {
  return new Request(`${APP}/api/mcp`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      // The 2026-07-28 era repeats the method in a header.
      ...(isMessage(body) ? { "mcp-method": body.method } : {}),
      ...(isMessage(body) && typeof body.params?.name === "string"
        ? { "mcp-name": body.params.name }
        : {}),
      ...headers,
    },
    body:
      method === "POST"
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
  });
}

const serve = (request: Request) => serveMcp(request, deps);

function loggedLines() {
  return vi
    .mocked(console.info)
    .mock.calls.filter(([tag]) => tag === "[MCP_REQUEST]")
    .map(([, entry]) => entry as Record<string, unknown>);
}

describe("before authentication", () => {
  it.each(["GET", "DELETE"])(
    "answers %s with 405 and Allow: POST",
    async (method) => {
      const response = await serve(post(undefined, {}, method));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it.each(["https://evil.example", "null", "https://claude.ai.evil.example"])(
    "refuses the Origin %s with 403",
    async (origin) => {
      const response = await serve(post(rpc("tools/list"), { origin }));
      expect(response.status).toBe(403);
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, APP, "https://claude.ai", "https://chatgpt.com"])(
    "accepts the Origin %s",
    async (origin) => {
      const response = await serve(
        post(rpc("tools/list"), origin ? { origin } : {}),
      );
      expect(response.status).toBe(200);
    },
  );

  it.each(["text/plain", "application/x-www-form-urlencoded", ""])(
    "refuses the content type %j with 415",
    async (type) => {
      const response = await serve(
        post(rpc("tools/list"), { "content-type": type }),
      );
      expect(response.status).toBe(415);
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it("accepts a body of exactly 64 KiB and refuses one byte more", async () => {
    const base = JSON.stringify(rpc("tools/list", { pad: "" })).length;
    const padded = (size: number) =>
      JSON.stringify(rpc("tools/list", { pad: "x".repeat(size - base) }));
    expect(padded(65_536)).toHaveLength(65_536);
    const headers = { "mcp-method": "tools/list" };
    expect((await serve(post(padded(65_536), headers))).status).toBe(200);
    const over = await serve(post(padded(65_537), headers));
    expect(over.status).toBe(413);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("refuses an array without counting or running any call", async () => {
    const batch = Array.from({ length: 61 }, (_, id) =>
      rpc("tools/call", { name: "read_request_status", arguments: {} }, id),
    );
    const response = await serve(post(batch));
    expect(response.status).toBe(400);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(["{", "42", '"text"', "null"])(
    "refuses the body %s with 400",
    async (body) => {
      expect((await serve(post(body))).status).toBe(400);
      expect(resolve).not.toHaveBeenCalled();
    },
  );
});

describe("authentication", () => {
  it.each(["initialize", "server/discover", "tools/list", "tools/call"])(
    "challenges %s without a token",
    async (method) => {
      resolve.mockResolvedValue({ status: "refused" });
      const response = await serve(post(rpc(method)));
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(CHALLENGE);
      expect(resolve).toHaveBeenCalledWith(null);
    },
  );

  it("names invalid_token when a token was sent", async () => {
    resolve.mockResolvedValue({ status: "refused" });
    const response = await serve(
      post(rpc("tools/list"), { authorization: "Bearer a.b.c" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `${CHALLENGE}, error="invalid_token", error_description="The access token is not valid. Connect again."`,
    );
    expect(resolve).toHaveBeenCalledWith("Bearer a.b.c");
  });

  it("answers an outage with 503 and Retry-After", async () => {
    resolve.mockResolvedValue({ status: "unavailable" });
    const response = await serve(post(rpc("tools/list")));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.json()).toMatchObject({
      id: 1,
      error: { message: expect.stringMatching(/try again in a minute/i) },
    });
  });

  it("answers a limited list call with 429 and the wait", async () => {
    resolve.mockResolvedValue({
      status: "limited",
      assistant: "claude",
      retryAfter: 17,
    });
    const response = await serve(post(rpc("tools/list")));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
  });

  it("answers a limited tool call with a tool result", async () => {
    resolve.mockResolvedValue({
      status: "limited",
      assistant: "claude",
      retryAfter: 17,
    });
    const response = await serve(
      post(
        rpc("tools/call", {
          name: "find_households",
          arguments: { name: "Casa" },
        }),
      ),
    );
    expect(response.status).toBe(200);
    const { result } = (await response.json()) as {
      result: { isError: boolean; structuredContent: unknown };
    };
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: "rate_limited",
      retryAfter: 17,
    });
  });

  it("refuses subscriptions/listen after authentication, before dispatch", async () => {
    const response = await serve(post(rpc("subscriptions/listen", {}, 7)));
    expect(response.status).toBe(404);
    expect(await response.json()).toStrictEqual({
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32601, message: "Method not found" },
    });
    resolve.mockResolvedValue({ status: "refused" });
    expect((await serve(post(rpc("subscriptions/listen")))).status).toBe(401);
  });
});

describe("dispatch", () => {
  it("lists exactly the three tools to a resolved guest", async () => {
    const response = await serve(post(rpc("tools/list")));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { result } = (await response.json()) as {
      result: { tools: { name: string }[] };
    };
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "find_households",
      "search_stays",
      "read_request_status",
    ]);
  });

  it("declares tools only, without list changes", async () => {
    const response = await serve(post(rpc("server/discover")));
    const { result } = (await response.json()) as {
      result: { capabilities: unknown };
    };
    expect(result.capabilities).toStrictEqual({
      tools: { listChanged: false },
    });
  });

  it("sends no-store on refusals too", async () => {
    resolve.mockResolvedValue({ status: "refused" });
    for (const request of [post(rpc("tools/list")), post("[]")])
      expect((await serve(request)).headers.get("cache-control")).toBe(
        "no-store",
      );
  });

  it.each(["2025-11-25", "2026-07-28"])(
    "logs the tool outcome after the %s answer is complete",
    async (version) => {
      // The status read waits for a database that refuses the connection.
      vi.stubEnv("DATABASE_URL", "postgresql://nobody@127.0.0.1:1/none");
      const legacy = version === "2025-11-25";
      const body = {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: legacy
          ? { name: "read_request_status", arguments: {} }
          : rpc("tools/call", { name: "read_request_status", arguments: {} })
              .params,
      };
      const response = await serve(
        post(body, legacy ? { "mcp-protocol-version": version } : {}),
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("unavailable");
      expect(loggedLines()).toEqual([
        expect.objectContaining({
          method: "tools/call",
          tool: "read_request_status",
          outcome: "unavailable",
        }),
      ]);
    },
  );

  it("logs one line for each request, without values", async () => {
    await serve(
      post(
        rpc("tools/call", {
          name: "secret-tool-canary",
          arguments: { name: "argument-canary" },
        }),
        { authorization: "Bearer token-canary.a.b" },
      ),
    );
    resolve.mockResolvedValue({ status: "refused" });
    await serve(post(rpc("tools/list"), { origin: "https://evil.example" }));
    await serve(post(rpc("method-canary/x!")));
    await serve(post(rpc("notifications/canary")));
    const lines = loggedLines();
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({
      assistant: "claude",
      method: "tools/call",
      tool: "other",
      ms: expect.any(Number),
    });
    // The Origin check comes before the body is read.
    expect(lines[1]).toMatchObject({ method: "none", outcome: "origin" });
    expect(lines[2]).toMatchObject({ method: "other", outcome: "refused" });
    expect(lines[3]).toMatchObject({ method: "other", outcome: "refused" });
    const logged = JSON.stringify([
      ...vi.mocked(console.info).mock.calls,
      ...vi.mocked(console.error).mock.calls,
    ]);
    expect(logged).not.toMatch(/canary|7b1f2c9e|2f1a3c5d/);
  });
});
