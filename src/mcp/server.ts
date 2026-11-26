import "@/core/server-only";

import {
  ProtocolError,
  ProtocolErrorCode,
  Server,
  createMcpHandler,
  isJsonContentType,
  readRequestBody,
} from "@modelcontextprotocol/server";

import type { AssistantName } from "@/core/assistant-access/clients";
import type { AssistantAccess } from "@/lib/auth/assistant-bearer";
import { isPlainObject } from "@/lib/json-object";

import { ASSISTANT_SCOPE, bearerChallenge } from "./resource";
import { TOOLS, callTool, toolNamed, type ToolContext } from "./tools";

const MAX_BODY_BYTES = 64 * 1024;
const OUTAGE_RETRY_SECONDS = 30;
const ASSISTANT_ORIGINS = ["https://claude.ai", "https://chatgpt.com"];
// Other names are logged as "other": the caller chooses the text.
const LOGGED_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "server/discover",
  "tools/list",
  "tools/call",
  "subscriptions/listen",
  "ping",
]);

export interface McpDeps {
  appUrl: string;
  resolve(authorization: string | null): Promise<AssistantAccess>;
}

/** What one request hands its tool handler, and what the handler reports. */
interface RequestState {
  context: ToolContext;
  outcome?: string;
}

const STATE = "layalga";

// One handler for the process. It builds a fresh low-level Server for each
// request, so nothing is shared between guests. `McpServer` would answer
// schema errors itself, and the recovery contract would not hold.
const handler = createMcpHandler(
  ({ authInfo }) => {
    const state = authInfo?.extra?.[STATE] as RequestState | undefined;
    const server = new Server(
      { name: "layalga", title: "L’Ayalga", version: "1.0.0" },
      { capabilities: { tools: { listChanged: false } } },
    );
    server.setRequestHandler("tools/list", () => ({ tools: TOOLS }));
    server.setRequestHandler("tools/call", async ({ params }) => {
      if (!state)
        throw new ProtocolError(ProtocolErrorCode.InternalError, "No guest");
      const { status, ...result } = await callTool(
        params.name,
        params.arguments,
        state.context,
      );
      state.outcome = status;
      return server.projectCallToolResult(
        result,
        toolNamed(params.name)?.outputSchema,
      );
    });
    return server;
  },
  // `responseMode` covers the 2026-07-28 era only; a 2025-era client can get
  // a one-event SSE answer. No keep-alive: nothing streams.
  { legacy: "stateless", responseMode: "json", keepAliveMs: 0 },
);

interface LogEntry {
  assistant?: AssistantName;
  method: string;
  tool?: string;
  outcome: string;
}

/**
 * The assistant endpoint. Authentication precedes every method, including
 * `initialize`, `server/discover` and `tools/list`.
 */
export async function serveMcp(
  request: Request,
  deps: McpDeps,
): Promise<Response> {
  const started = performance.now();
  const entry: LogEntry = { method: "none", outcome: "error" };
  try {
    const response = await serve(request, deps, entry);
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    headers.delete("connection");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } finally {
    console.info("[MCP_REQUEST]", {
      ...entry,
      ms: Math.round(performance.now() - started),
    });
  }
}

async function serve(
  request: Request,
  { appUrl, resolve }: McpDeps,
  entry: LogEntry,
): Promise<Response> {
  if (request.method !== "POST") {
    entry.outcome = "method_not_allowed";
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const origin = request.headers.get("origin");
  if (
    origin !== null &&
    ![new URL(appUrl).origin, ...ASSISTANT_ORIGINS].includes(origin)
  )
    return refuse(entry, "origin", 403);
  if (!isJsonContentType(request.headers.get("content-type")))
    return refuse(entry, "content_type", 415);
  // `parsedBody` skips the SDK's own size limit, so this route owns it.
  const read = await readRequestBody(request, MAX_BODY_BYTES).catch(() => null);
  if (!read) return refuse(entry, "body", 400);
  if (read.tooLarge) return refuse(entry, "too_large", 413);
  let body: unknown;
  try {
    body = JSON.parse(read.text);
  } catch {
    return refuse(entry, "body", 400);
  }
  // An array would hide several calls behind one count.
  if (!isPlainObject(body)) return refuse(entry, "body", 400);
  const id =
    typeof body.id === "string" || typeof body.id === "number" ? body.id : null;
  const method = typeof body.method === "string" ? body.method : "";
  entry.method = LOGGED_METHODS.has(method) ? method : "other";
  if (method === "tools/call") {
    const name = (body.params as { name?: unknown } | undefined)?.name;
    entry.tool = toolNamed(name)?.name ?? "other";
  }

  const authorization = request.headers.get("authorization");
  const access = await resolve(authorization);
  if (access.status === "refused") {
    entry.outcome = "refused";
    return Response.json(
      { error: authorization === null ? "unauthorized" : "invalid_token" },
      {
        status: 401,
        headers: {
          "www-authenticate": bearerChallenge(appUrl, authorization !== null),
        },
      },
    );
  }
  if (access.status === "unavailable") {
    entry.outcome = "unavailable";
    return rpcError(
      id,
      503,
      "L’Ayalga is unavailable. Try again in a minute.",
      {
        "retry-after": String(OUTAGE_RETRY_SECONDS),
      },
    );
  }
  entry.assistant =
    access.status === "ok" ? access.principal.assistant : access.assistant;
  if (access.status === "limited" && method !== "tools/call") {
    entry.outcome = "limited";
    return rpcError(
      id,
      429,
      `Too many requests. Retry after ${access.retryAfter} seconds.`,
      { "retry-after": String(access.retryAfter) },
    );
  }
  // A listen stream would hold a function open for its whole duration.
  if (method === "subscriptions/listen") {
    entry.outcome = "listen";
    return rpcError(
      id,
      404,
      "Method not found",
      {},
      ProtocolErrorCode.MethodNotFound,
    );
  }

  const state: RequestState = {
    context: {
      appUrl,
      access:
        access.status === "ok"
          ? { status: "ok", userId: access.principal.userId }
          : { status: "limited", retryAfter: access.retryAfter },
    },
  };
  const response = await handler.fetch(request, {
    parsedBody: body,
    authInfo: {
      // The tools never need the token itself.
      token: "redacted",
      clientId: access.status === "ok" ? access.principal.clientId : "limited",
      scopes: [ASSISTANT_SCOPE],
      extra: { [STATE]: state },
    },
  });
  // A 2025-era answer is a stream that the SDK returns before the tool has
  // run. Nothing here streams for long, so read it whole before the log.
  const answer = await response.arrayBuffer();
  entry.outcome =
    state.outcome ?? (response.ok ? "ok" : `http_${response.status}`);
  return new Response(answer, response);
}

function refuse(entry: LogEntry, outcome: string, status: number) {
  entry.outcome = outcome;
  return new Response(null, { status });
}

function rpcError(
  id: string | number | null,
  status: number,
  message: string,
  headers: Record<string, string>,
  code: number = ProtocolErrorCode.InternalError,
) {
  return Response.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status, headers },
  );
}
