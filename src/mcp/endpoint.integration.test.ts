import { randomUUID } from "node:crypto";

import {
  Client,
  SdkHttpError,
  StreamableHTTPClientTransport,
  type VersionNegotiationMode,
} from "@modelcontextprotocol/client";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { FakeClock } from "@/core/clock";
import { closeDatabase } from "@/core/db/client";
import { searchPublicStays } from "@/core/booking/public-stay-search";
import { submitStayRequest } from "@/core/booking/stay-requests";
import { resolveAssistant } from "@/lib/auth/assistant-bearer";
import {
  assistantFixtures,
  authCall,
  codeFlow,
  type FixtureUser,
} from "@/test-support/assistant-oauth";
import { createFixtureHousehold } from "@/test-support/fixture-household";
import {
  localAdmin,
  localSupabase,
  localWebDatabase,
} from "@/test-support/local-supabase";

import { POST } from "@/app/api/mcp/route";

import { serveMcp, type McpDeps } from "./server";

// Fixtures write as the owner; the endpoint reads as the web runtime, as in
// production. Both connections are built before DATABASE_URL changes.
const local = localSupabase();
const db = postgres(local.databaseUrl, { max: 2, prepare: false });
const admin = localAdmin();
const web = localWebDatabase();
const webUrl = new URL(local.adminUrl);
webUrl.searchParams.set("role", "layalga_web_runtime");
const fixtures = assistantFixtures(db, admin);
const APP = "http://127.0.0.1:3048";
const ENDPOINT = `${APP}/api/mcp`;
const ALLOWED_KEYS = new Set([
  "status",
  "next",
  "retryAfter",
  "households",
  "handle",
  "name",
  "pageUrl",
  "truncated",
  "rooms",
  "room",
  "floor",
  "sleepingArrangement",
  "overflowArrangement",
  "standardCapacity",
  "maximumCapacity",
  "stays",
  "checkIn",
  "checkout",
  "confirmation",
  "recommended",
  "continueUrl",
  "requests",
  "household",
  "requestStatus",
  "visitStatus",
  "historyUrl",
]);

const logs: unknown[][] = [];
const secrets: string[] = [];
const cleanups: (() => Promise<unknown>)[] = [];

interface Household {
  handle: string;
  name: string;
  homeId: string;
  canaries: string[];
  ids: string[];
}

const criteria = {
  from: "2090-07-01",
  to: "2090-07-15",
  nights: 14,
  adults: 2,
  children: 0,
  pets: 0,
};

async function household({ published = true } = {}): Promise<Household> {
  const marker = randomUUID().slice(0, 8);
  const home = await createFixtureHousehold(db, {
    label: `CANARY-home-${marker}`,
    parties: [],
    tokenSecret: "fixture",
  });
  cleanups.push(home.cleanup);
  const canaries = [
    `CANARY-home-${marker}`,
    `CANARY-room-${marker}`,
    `CANARY-private-${marker}`,
    `CANARY-host-${marker}`,
  ];
  await db`update public.rooms set name=${canaries[1]!} || '-' || display_order, private_notes=${canaries[2]!} where home_id=${home.homeId}`;
  await db`update public.hosts set display_name=${canaries[3]!} where home_id=${home.homeId}`;
  const name = `Synthetic Vega ${marker}`;
  const [row] = await db<{ handle: string }[]>`
    insert into public.household_public_listings (home_id, display_name, search_name, published)
    values (${home.homeId}, ${name}, ${name.toLowerCase()}, ${published})
    returning handle`;
  return {
    handle: row!.handle,
    name,
    homeId: home.homeId,
    canaries,
    ids: [home.homeId, ...home.roomIds, ...home.hostIds],
  };
}

async function request(
  user: FixtureUser,
  home: Household,
  stay: typeof criteria,
  text: string,
) {
  const option = (await searchPublicStays(home.handle, stay)).options[0]!;
  const outcome = await submitStayRequest(
    { userId: user.id, email: user.email },
    {
      handle: home.handle,
      criteria: stay,
      roomRefs: option.recommendedRoomRefs,
      overflowConsent: false,
      notes: `${text} notes`,
      requests: `${text} requests`,
      locale: "es",
      idempotencyKey: randomUUID(),
    },
  );
  expect(outcome.status).toBe("pending");
  return {
    id: (outcome as { requestId: string }).requestId,
    refs: option.rooms.map((room) => room.ref),
  };
}

async function connected(options?: { google?: boolean }) {
  const user = await fixtures.user(options);
  const client = await fixtures.client();
  const issued = await codeFlow(user, client);
  expect(issued.status).toBe(200);
  const token = String(issued.body.access_token);
  secrets.push(token, user.accessToken, user.email, user.id, client);
  return { user, client, token, header: `Bearer ${token}` };
}

/** The route module itself, with its live resolver. */
const route = (request: Request) => POST(request);

function liveDeps(
  change: Partial<Parameters<typeof resolveAssistant>[1]> = {},
): McpDeps {
  return {
    appUrl: APP,
    resolve: (authorization) =>
      resolveAssistant(authorization, {
        database: web.db,
        clock: new FakeClock(new Date()),
        supabase: { url: local.url, key: local.key },
        ...change,
      }),
  };
}

async function mcpClient(
  header: string,
  mode: VersionNegotiationMode,
  serve: (request: Request) => Promise<Response> = route,
) {
  const client = new Client(
    { name: "endpoint-test", version: "1" },
    { versionNegotiation: { mode } },
  );
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    fetch: (input, init) => serve(new Request(input, init)),
    requestInit: { headers: { authorization: header } },
  });
  await client.connect(transport);
  cleanups.push(() => client.close());
  return client;
}

/** One raw JSON-RPC POST in the 2026-07-28 form. */
function rpc(
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {},
  url = ENDPOINT,
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "raw", version: "1" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
}

const structured = (result: unknown) =>
  (result as { structuredContent: Record<string, unknown> }).structuredContent;

const ERAS: [string, VersionNegotiationMode][] = [
  ["2025-11-25", "legacy"],
  ["2026-07-28", { pin: "2026-07-28" }],
];

beforeAll(() => {
  vi.stubEnv("ASSISTANT_ACCESS", "on");
  vi.stubEnv("APP_URL", APP);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", local.url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", local.key);
  vi.stubEnv("DATABASE_URL", webUrl.toString());
  for (const level of ["info", "error", "warn", "log"] as const)
    vi.spyOn(console, level).mockImplementation((...args) => {
      logs.push(args);
    });
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  await fixtures.cleanup();
});
afterAll(async () => {
  // Log capture over the whole file: no token, email, user ID or argument value.
  const text = JSON.stringify(logs);
  for (const secret of secrets) expect(text).not.toContain(secret);
  for (const value of ["Synthetic Vega", "2090-0", "CANARY"])
    expect(text).not.toContain(value);
  expect(logs.some(([tag]) => tag === "[MCP_REQUEST]")).toBe(true);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await closeDatabase();
  await Promise.all([db, admin, web.sql].map((sql) => sql.end({ timeout: 5 })));
});

describe("official client", { timeout: 60_000 }, () => {
  it.each(ERAS)(
    "discovers the server and calls each tool in the %s era",
    async (version, mode) => {
      const home = await household();
      const { user, header } = await connected();
      const other = await fixtures.user();
      secrets.push(other.email, other.id);
      const own = await request(user, home, criteria, "CANARY-own");
      const foreign = await request(
        other,
        home,
        { ...criteria, from: "2090-08-01", to: "2090-08-15" },
        "CANARY-other",
      );

      const client = await mcpClient(header, mode);
      expect(client.getNegotiatedProtocolVersion()).toBe(version);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        "find_households",
        "search_stays",
        "read_request_status",
      ]);

      const answers: unknown[] = [];
      const call = async (name: string, args: Record<string, unknown>) => {
        const result = await client.callTool({ name, arguments: args });
        answers.push(result);
        return structured(result);
      };
      expect(await call("find_households", { name: home.name })).toStrictEqual({
        status: "success",
        households: [
          {
            handle: home.handle,
            name: home.name,
            pageUrl: `${APP}/stays/${home.handle}`,
          },
        ],
        truncated: false,
      });
      const stays = await call("search_stays", {
        handle: home.handle,
        ...criteria,
      });
      expect(stays).toMatchObject({
        status: "success",
        rooms: [
          { room: "r1", name: "Guest Room", floor: "Upper floor" },
          { room: "r2", name: "Garage Room" },
        ],
        stays: [
          {
            checkIn: "2090-07-01",
            checkout: "2090-07-15",
            confirmation: "host_approval_required",
          },
        ],
        continueUrl: `${APP}/stays/${home.handle}?from=2090-07-01&to=2090-07-15&nights=14&adults=2&children=0&pets=0`,
      });
      const status = await call("read_request_status", {});
      // Another guest's request is absent.
      expect(status).toStrictEqual({
        status: "success",
        requests: [
          {
            household: home.name,
            checkIn: "2090-07-01",
            checkout: "2090-07-15",
            requestStatus: "pending",
            visitStatus: null,
          },
        ],
        truncated: false,
        historyUrl: `${APP}/requests`,
      });
      const probing = await client.callTool({
        name: "read_request_status",
        arguments: { id: foreign.id },
      });
      answers.push(probing);
      expect(probing.isError).toBe(true);
      expect(structured(probing).status).toBe("invalid");

      // Recursive key and value scan of every answer.
      const forbidden = [
        ...home.canaries,
        ...home.ids,
        own.id,
        foreign.id,
        ...own.refs,
        ...foreign.refs,
        user.id,
        user.email,
        other.id,
        other.email,
        "Europe/Madrid",
        "2090-08-01",
        // Notes and requests of both guests, room and host canaries.
        "CANARY",
      ];
      const scan = (value: unknown, path: string): void => {
        if (Array.isArray(value))
          value.forEach((item, i) => scan(item, `${path}[${i}]`));
        else if (value && typeof value === "object")
          for (const [key, item] of Object.entries(value)) {
            expect(ALLOWED_KEYS.has(key), `${path}.${key}`).toBe(true);
            scan(item, `${path}.${key}`);
          }
        else
          for (const text of forbidden)
            expect(String(value), path).not.toContain(text);
      };
      for (const answer of answers) {
        const { structuredContent, content } = answer as {
          structuredContent: unknown;
          content: { text: string }[];
        };
        scan(structuredContent, "structuredContent");
        expect(JSON.parse(content[0]!.text)).toStrictEqual(structuredContent);
      }
    },
  );

  it("keeps an unpublished household out of both lookups", async () => {
    const hidden = await household({ published: false });
    const { header } = await connected();
    const client = await mcpClient(header, "legacy");
    const byName = await client.callTool({
      name: "find_households",
      arguments: { name: hidden.name },
    });
    expect(structured(byName).status).toBe("none");
    const byHandle = await client.callTool({
      name: "search_stays",
      arguments: { handle: hidden.handle, ...criteria },
    });
    expect(structured(byHandle).status).toBe("not_found");
  });
});

describe("refusals on the route", { timeout: 60_000 }, () => {
  const CHALLENGE = `Bearer resource_metadata="${APP}/.well-known/oauth-protected-resource/api/mcp", scope="openid"`;

  it.each(["initialize", "server/discover", "tools/list", "tools/call"])(
    "challenges %s without a token",
    async (method) => {
      const response = await route(
        rpc(
          method,
          method === "tools/call"
            ? { name: "read_request_status", arguments: {} }
            : {},
        ),
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(CHALLENGE);
    },
  );

  it("names the resource that the metadata publishes", async () => {
    const { GET } = await import("@/app/api/mcp/metadata/route");
    const metadata = (await (await GET()).json()) as Record<string, unknown>;
    expect(metadata.resource).toBe(ENDPOINT);
    expect(metadata.authorization_servers).toEqual([local.issuer]);
  });

  it("refuses every token variant with 401", async () => {
    const list = (headers: Record<string, string>, url?: string) =>
      route(rpc("tools/list", {}, headers, url));
    const { user, client, token, header } = await connected();
    expect((await list({ authorization: header })).status).toBe(200);

    const refusals: [string, () => Promise<Response>][] = [
      // A web token has the wrong audience and no client.
      [
        "web session token",
        () => list({ authorization: `Bearer ${user.accessToken}` }),
      ],
      [
        "client token in a cookie",
        () => list({ cookie: `sb-access-token=${token}` }),
      ],
      [
        "client token in the query",
        () => list({}, `${ENDPOINT}?access_token=${token}`),
      ],
      [
        "expired token",
        () =>
          serveMcp(
            rpc("tools/list", {}, { authorization: header }),
            liveDeps({
              clock: new FakeClock(new Date(Date.now() + 2 * 3_600_000)),
            }),
          ),
      ],
    ];
    for (const [name, attempt] of refusals) {
      const response = await attempt();
      expect(response.status, name).toBe(401);
      expect(response.headers.get("www-authenticate"), name).toMatch(
        /^Bearer resource_metadata=/,
      );
    }

    await admin`update public.assistant_clients set enabled=false where client_id=${client}`;
    expect(
      (await list({ authorization: header })).status,
      "disabled client",
    ).toBe(401);
    await admin`update public.assistant_clients set enabled=true where client_id=${client}`;
    expect((await list({ authorization: header })).status).toBe(200);

    const hostId = await fixtures.host({ authUserId: user.id });
    expect((await list({ authorization: header })).status, "host").toBe(401);
    await db`update public.hosts set auth_user_id=null where id=${hostId}`;

    await authCall("DELETE", `/auth/v1/user/oauth/grants?client_id=${client}`, {
      token: user.accessToken,
    });
    expect(
      (await list({ authorization: header })).status,
      "revoked grant",
    ).toBe(401);
  });

  it("refuses an account without a Google identity", async () => {
    const { header } = await connected({ google: false });
    expect(
      (await route(rpc("tools/list", {}, { authorization: header }))).status,
    ).toBe(401);
  });
});

describe("limits and outages", { timeout: 120_000 }, () => {
  it.each(ERAS)(
    "answers the rate limit in the %s era and recovers in the next window",
    async (_version, mode) => {
      const { header } = await connected();
      const clock = new FakeClock(new Date());
      const deps = liveDeps({ clock });
      const client = await mcpClient(header, mode, (request) =>
        serveMcp(request, deps),
      );
      let limited: Record<string, unknown> | undefined;
      for (let call = 0; call < 61 && !limited; call += 1) {
        const result = await client.callTool({
          name: "read_request_status",
          arguments: {},
        });
        if (structured(result).status === "rate_limited") {
          expect(result.isError).toBe(true);
          limited = structured(result);
        }
      }
      expect(limited).toMatchObject({
        status: "rate_limited",
        retryAfter: expect.any(Number),
        next: expect.stringMatching(/^Too many requests\. Wait \d+ seconds/),
      });
      const listed = await client.listTools().catch((error: unknown) => error);
      expect(listed).toBeInstanceOf(SdkHttpError);
      expect((listed as SdkHttpError).status).toBe(429);

      clock.advance(61_000);
      const again = await client.callTool({
        name: "read_request_status",
        arguments: {},
      });
      expect(structured(again).status).toBe("none");
    },
  );

  it("answers 503 while /user is down, then serves the same token", async () => {
    const { header } = await connected();
    let down = true;
    const deps = liveDeps({
      fetch: (input, init) =>
        down
          ? Promise.reject(new TypeError("fetch failed"))
          : fetch(input, init),
    });
    const client = await mcpClient(header, "legacy", (request) =>
      serveMcp(request, deps),
    ).catch((error: unknown) => error);
    expect(client).toBeInstanceOf(SdkHttpError);
    expect((client as SdkHttpError).status).toBe(503);
    down = false;
    const recovered = await mcpClient(header, "legacy", (request) =>
      serveMcp(request, deps),
    );
    const result = await recovered.callTool({
      name: "read_request_status",
      arguments: {},
    });
    expect(structured(result).status).toBe("none");
  });
});
