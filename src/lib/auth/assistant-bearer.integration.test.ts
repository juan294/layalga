import { randomUUID } from "node:crypto";

import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ASSISTANT_AUDIENCE } from "@/core/assistant-access/audience";
import { FakeClock, SystemClock } from "@/core/clock";
import {
  allowClient,
  authCall,
  codeFlow,
  createAssistantUser,
  deleteClient,
  localAdmin,
  localSupabase,
  registerClient,
} from "@/test-support/assistant-oauth";

import {
  assistantKeys,
  resolveAssistant,
  type AssistantBearerDeps,
} from "./assistant-bearer";

const local = localSupabase();
const db = postgres(local.databaseUrl, { max: 2, prepare: false });
const admin = localAdmin();
const web = localAdmin("layalga_web_runtime");
const cleanups: (() => Promise<unknown>)[] = [];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
afterAll(async () => {
  await Promise.all([db, admin, web].map((sql) => sql.end({ timeout: 5 })));
});

async function newClient(enabled = true) {
  const id = await registerClient(admin);
  await allowClient(admin, id, { enabled });
  cleanups.push(async () => {
    await deleteClient(admin, id);
    await db`delete from public.assistant_request_windows where subject like ${`%${id}`}`;
  });
  return id;
}

async function newHost(
  authUserId: string | null = null,
  preparedEmail?: string,
) {
  const [home] = await db<{ id: string }[]>`
    insert into public.homes(name,timezone) values(${`Bearer ${randomUUID()}`},'Europe/Madrid') returning id`;
  cleanups.push(() => db`delete from public.homes where id=${home!.id}`);
  const [host] = await db<{ id: string }[]>`
    insert into public.hosts(home_id,display_name,locale,auth_user_id)
    values(${home!.id},'Bearer host','en',${authUserId}) returning id`;
  if (preparedEmail)
    await db`insert into public.host_identity_claims(normalized_email,host_id,home_id)
      values(${preparedEmail},${host!.id},${home!.id})`;
}

describe("resolveAssistant on local Auth", () => {
  const live = (): AssistantBearerDeps => ({
    database: web,
    clock: new SystemClock(),
    supabase: { url: local.url, key: local.key },
    jwks: assistantKeys(local.url),
  });

  async function connect(options?: { google?: boolean }) {
    const user = await createAssistantUser(db, options);
    cleanups.push(() => db`delete from auth.users where id=${user.id}`);
    const client = await newClient();
    const issued = await codeFlow(user, client);
    return {
      user,
      client,
      header: `Bearer ${String(issued.body.access_token)}`,
    };
  }

  it("accepts the token that Auth issues to an enabled client", async () => {
    const { user, client, header } = await connect();
    expect(await resolveAssistant(header, live())).toEqual({
      status: "ok",
      principal: { userId: user.id, clientId: client, assistant: "claude" },
    });
    expect(console.error).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
  });

  it("refuses a web token", async () => {
    const { user } = await connect();
    expect(
      await resolveAssistant(`Bearer ${user.accessToken}`, live()),
    ).toEqual({ status: "refused" });
  });

  it("refuses a revoked grant at once", async () => {
    const { user, client, header } = await connect();
    await authCall("DELETE", `/auth/v1/user/oauth/grants?client_id=${client}`, {
      token: user.accessToken,
    });
    expect(await resolveAssistant(header, live())).toEqual({
      status: "refused",
    });
  });

  it("refuses a deleted and a banned user", async () => {
    const deleted = await connect();
    await db`delete from auth.users where id=${deleted.user.id}`;
    expect(await resolveAssistant(deleted.header, live())).toEqual({
      status: "refused",
    });
    const banned = await connect();
    await db`update auth.users set banned_until=now()+interval '1 day' where id=${banned.user.id}`;
    expect(await resolveAssistant(banned.header, live())).toEqual({
      status: "refused",
    });
  });

  it("refuses a client disabled after it connected", async () => {
    const { client, header } = await connect();
    await admin`update public.assistant_clients set enabled=false where client_id=${client}`;
    expect(await resolveAssistant(header, live())).toEqual({
      status: "refused",
    });
  });

  it("refuses a guest who became a host or was prepared as one", async () => {
    const bound = await connect();
    await newHost(bound.user.id);
    expect(await resolveAssistant(bound.header, live())).toEqual({
      status: "refused",
    });
    const prepared = await connect();
    await newHost(null, prepared.user.email);
    expect(await resolveAssistant(prepared.header, live())).toEqual({
      status: "refused",
    });
  });

  it("refuses an account without a confirmed Google identity", async () => {
    const password = await connect({ google: false });
    expect(await resolveAssistant(password.header, live())).toEqual({
      status: "refused",
    });
    const unconfirmed = await connect();
    await db`update auth.users set email_confirmed_at=null where id=${unconfirmed.user.id}`;
    expect(await resolveAssistant(unconfirmed.header, live())).toEqual({
      status: "refused",
    });
  });
});

describe("resolveAssistant with a scripted Auth answer", () => {
  const NOW = new Date("2026-11-25T12:00:00Z");
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: AssistantBearerDeps["jwks"];
  let userId: string;

  beforeAll(async () => {
    keys = await generateKeyPair("ES256");
    jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(keys.publicKey)), alg: "ES256" }],
    });
  });
  beforeEach(() => {
    userId = randomUUID();
  });

  const user = (change: Record<string, unknown> = {}) => ({
    id: userId,
    email: `scripted-${userId}@fixture.test`,
    email_confirmed_at: "2026-11-01T00:00:00Z",
    identities: [{ provider: "google" }],
    ...change,
  });

  async function scripted(
    answer: (url: string, init: RequestInit) => Response | Promise<Response>,
    {
      client,
      clock = new FakeClock(NOW),
    }: { client?: string; clock?: FakeClock } = {},
  ) {
    const clientId = client ?? (await newClient());
    const seconds = Math.floor(NOW.getTime() / 1000);
    const token = await new SignJWT({
      client_id: clientId,
      session_id: randomUUID(),
    })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer(`${local.url}/auth/v1`)
      .setAudience(ASSISTANT_AUDIENCE)
      .setSubject(userId)
      .setIssuedAt(seconds)
      .setExpirationTime(seconds + 3600)
      .sign(keys.privateKey);
    const fetchUser = vi.fn(async (url: unknown, init?: RequestInit) =>
      answer(String(url), init ?? {}),
    );
    const result = await resolveAssistant(`Bearer ${token}`, {
      database: web,
      clock,
      supabase: { url: local.url, key: "publishable" },
      jwks,
      fetch: fetchUser as typeof fetch,
    });
    return { result, fetchUser, token };
  }

  it("asks Auth with the publishable key and the token, and follows no redirect", async () => {
    const { result, fetchUser, token } = await scripted(() =>
      Response.json(user()),
    );
    expect(result).toMatchObject({ status: "ok" });
    expect(fetchUser).toHaveBeenCalledTimes(1);
    const [url, init] = fetchUser.mock.calls[0]!;
    expect(url).toBe(`${local.url}/auth/v1/user`);
    expect(init).toMatchObject({
      headers: { apikey: "publishable", authorization: `Bearer ${token}` },
      redirect: "error",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it.each(["session_not_found", "user_not_found", "user_banned", "bad_jwt"])(
    "refuses the Auth code %s",
    async (code) => {
      const { result } = await scripted(() =>
        Response.json(
          { code: 403, error_code: code, msg: "no" },
          { status: 403 },
        ),
      );
      expect(result).toEqual({ status: "refused" });
    },
  );

  it.each<[string, () => Response | Promise<Response>]>([
    [
      "an invalid publishable key",
      () => Response.json({ message: "Invalid API key" }, { status: 401 }),
    ],
    [
      "an unknown 401 code",
      () => Response.json({ error_code: "other" }, { status: 401 }),
    ],
    ["a 403 without JSON", () => new Response("<html>", { status: 403 })],
    ["a 403 with a JSON null", () => Response.json(null, { status: 403 })],
    [
      "a rate limit",
      () =>
        Response.json(
          { error_code: "over_request_rate_limit" },
          { status: 429 },
        ),
    ],
    [
      "a server error",
      () =>
        Response.json({ error_code: "unexpected_failure" }, { status: 500 }),
    ],
    ["a 200 without JSON", () => new Response("ok")],
    ["a 200 without a user", () => Response.json({})],
    ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
    [
      "a timeout",
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
    ],
  ])("is unavailable after %s", async (_name, answer) => {
    const { result } = await scripted(answer);
    expect(result).toEqual({ status: "unavailable" });
    expect(console.error).toHaveBeenCalledWith("[ASSISTANT_AUTH]", {
      outcome: "unavailable_auth",
      assistant: "claude",
    });
  });

  it("stops a user read that takes longer than its limit", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation((limit) => {
      expect(limit).toBe(3_000);
      return AbortSignal.abort(new DOMException("timed out", "TimeoutError"));
    });
    try {
      const { result } = await scripted((_url, init) => {
        init.signal?.throwIfAborted();
        return Response.json(user());
      });
      expect(result).toEqual({ status: "unavailable" });
    } finally {
      vi.mocked(AbortSignal.timeout).mockRestore();
    }
  });

  it.each<[string, Record<string, unknown>]>([
    ["another account", { id: randomUUID() }],
    ["no confirmed email", { email_confirmed_at: null }],
    ["no email", { email: "" }],
    ["no Google identity", { identities: [{ provider: "email" }] }],
    ["no identity", { identities: null }],
  ])("refuses %s", async (_name, change) => {
    const { result } = await scripted(() => Response.json(user(change)));
    expect(result).toEqual({ status: "refused" });
  });

  it("refuses a disabled and an unknown client before Auth and before a count", async () => {
    for (const client of [await newClient(false), randomUUID()]) {
      const { result, fetchUser } = await scripted(
        () => Response.json(user()),
        { client },
      );
      expect(result).toEqual({ status: "refused" });
      expect(fetchUser).not.toHaveBeenCalled();
      expect(
        await db`select 1 from public.assistant_request_windows where subject like ${`%${client}`}`,
      ).toHaveLength(0);
    }
  });

  it("refuses a host before Auth, and a prepared host email in another case after it", async () => {
    await db`insert into auth.users(id,email,aud,role,created_at,updated_at)
      values(${userId},${user().email},'authenticated','authenticated',now(),now())`;
    cleanups.push(() => db`delete from auth.users where id=${userId}`);
    await newHost(userId);
    const bound = await scripted(() => Response.json(user()));
    expect(bound.result).toEqual({ status: "refused" });
    expect(bound.fetchUser).not.toHaveBeenCalled();

    userId = randomUUID();
    await newHost(null, user().email);
    const prepared = await scripted(() =>
      Response.json(user({ email: user().email.toUpperCase() })),
    );
    expect(prepared.result).toEqual({ status: "refused" });
    expect(prepared.fetchUser).toHaveBeenCalledTimes(1);
  });

  it("limits before Auth, and recovers when the window ends", async () => {
    const client = await newClient();
    await db`insert into public.assistant_request_windows(subject,span,started_at,requests)
      values(${`account:${userId}:${client}`},'minute',${NOW},60)`;
    const clock = new FakeClock(NOW);
    const limited = await scripted(() => Response.json(user()), {
      client,
      clock,
    });
    expect(limited.result).toEqual({ status: "limited", retryAfter: 60 });
    expect(limited.fetchUser).not.toHaveBeenCalled();
    clock.advance(60_000);
    expect(
      (await scripted(() => Response.json(user()), { client, clock })).result,
    ).toMatchObject({
      status: "ok",
    });
  });

  it("logs the outcome and the assistant only", async () => {
    await scripted(() => Response.json(user({ id: randomUUID() })));
    expect(vi.mocked(console.info).mock.calls).toEqual([
      [
        "[ASSISTANT_AUTH]",
        { outcome: "refused_identity", assistant: "claude" },
      ],
    ]);
  });
});
