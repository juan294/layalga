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
  authCall,
  codeFlow,
  assistantFixtures,
} from "@/test-support/assistant-oauth";
import {
  localAdmin,
  localSupabase,
  localWebDatabase,
} from "@/test-support/local-supabase";

import { resolveAssistant, type AssistantBearerDeps } from "./assistant-bearer";

const local = localSupabase();
const db = postgres(local.databaseUrl, { max: 2, prepare: false });
const admin = localAdmin();
const web = localWebDatabase();
const fixtures = assistantFixtures(db, admin);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fixtures.cleanup();
});
afterAll(async () => {
  await Promise.all([db, admin, web.sql].map((sql) => sql.end({ timeout: 5 })));
});

/** The logged outcome names the check that decided. */
const loggedOutcome = () =>
  (vi.mocked(console.info).mock.lastCall?.[1] as { outcome?: string })?.outcome;

describe("resolveAssistant on local Auth", { timeout: 30_000 }, () => {
  const live = (): AssistantBearerDeps => ({
    database: web.db,
    clock: new SystemClock(),
    supabase: { url: local.url, key: local.key },
  });

  async function connect(options?: { google?: boolean }) {
    const user = await fixtures.user(options);
    const client = await fixtures.client();
    const issued = await codeFlow(user, client);
    expect(issued.status).toBe(200);
    return {
      user,
      client,
      header: `Bearer ${String(issued.body.access_token)}`,
    };
  }

  async function refusal(header: string) {
    vi.mocked(console.info).mockClear();
    expect(await resolveAssistant(header, live())).toEqual({
      status: "refused",
    });
    return loggedOutcome();
  }

  /** The code that Auth itself answers for this token. */
  const authCode = async (header: string) =>
    (
      await authCall("GET", "/auth/v1/user", {
        token: header.slice("Bearer ".length),
      })
    ).body.error_code;

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
    const user = await fixtures.user();
    expect(await refusal(`Bearer ${user.accessToken}`)).toBe("refused_token");
  });

  it("refuses a revoked grant at once", async () => {
    const { user, client, header } = await connect();
    await authCall("DELETE", `/auth/v1/user/oauth/grants?client_id=${client}`, {
      token: user.accessToken,
    });
    expect(await authCode(header)).toBe("session_not_found");
    expect(await refusal(header)).toBe("refused_connection");
  });

  it("refuses a deleted user", async () => {
    const { user, header } = await connect();
    await db`delete from auth.users where id=${user.id}`;
    expect(await authCode(header)).toBe("user_not_found");
    expect(await refusal(header)).toBe("refused_connection");
  });

  it("refuses a banned user", async () => {
    const { user, header } = await connect();
    await db`update auth.users set banned_until=now()+interval '1 day' where id=${user.id}`;
    expect(await authCode(header)).toBe("user_banned");
    expect(await refusal(header)).toBe("refused_connection");
  });

  it("knows the code of a token that Auth cannot verify", async () => {
    const { header } = await connect();
    expect(await authCode(`${header.slice(0, -6)}AAAAAA`)).toBe("bad_jwt");
  });

  it("refuses a client disabled after it connected", async () => {
    const { client, header } = await connect();
    await admin`update public.assistant_clients set enabled=false where client_id=${client}`;
    expect(await refusal(header)).toBe("refused_client");
  });

  it("refuses a guest who became a host", async () => {
    const { user, header } = await connect();
    await fixtures.host({ authUserId: user.id });
    expect(await refusal(header)).toBe("refused_host");
  });

  it("refuses a guest whose email was prepared for a host", async () => {
    const { user, header } = await connect();
    await fixtures.host({ preparedEmail: user.email });
    expect(await refusal(header)).toBe("refused_host");
  });

  it("refuses an account without a Google identity", async () => {
    const { header } = await connect({ google: false });
    expect(await refusal(header)).toBe("refused_identity");
  });

  it("refuses an account without a confirmed email", async () => {
    const { user, header } = await connect();
    await db`update auth.users set email_confirmed_at=null where id=${user.id}`;
    expect(await refusal(header)).toBe("refused_identity");
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
    const clientId = client ?? (await fixtures.client());
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
    const onUserCheck = vi.fn<(ms: number) => void>();
    const result = await resolveAssistant(`Bearer ${token}`, {
      database: web.db,
      clock,
      supabase: { url: local.url, key: "publishable" },
      jwks,
      fetch: fetchUser as typeof fetch,
      onUserCheck,
    });
    return { result, fetchUser, token, onUserCheck };
  }

  const slowly = <T>(ms: number, value: () => T) =>
    new Promise<T>((done, fail) =>
      setTimeout(() => {
        try {
          done(value());
        } catch (error) {
          fail(error);
        }
      }, ms),
    );

  it.each<[string, () => Response]>([
    ["an accepted account", () => Response.json(user())],
    [
      "an ended connection",
      () => Response.json({ error_code: "session_not_found" }, { status: 403 }),
    ],
    [
      "a failed read",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])(
    "reports the duration of the Auth read once, after %s",
    async (_name, answer) => {
      const { onUserCheck, fetchUser } = await scripted(() =>
        slowly(40, answer),
      );
      expect(fetchUser).toHaveBeenCalledTimes(1);
      expect(onUserCheck).toHaveBeenCalledTimes(1);
      const [ms] = onUserCheck.mock.calls[0]!;
      expect(ms).toBeGreaterThanOrEqual(39);
      expect(ms).toBeLessThan(3_000);
    },
  );

  it("reports no Auth time when the request ends before Auth", async () => {
    const refused = await scripted(() => Response.json(user()), {
      client: randomUUID(),
    });
    expect(refused.result).toEqual({ status: "refused" });
    expect(refused.onUserCheck).not.toHaveBeenCalled();
  });

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
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() =>
        AbortSignal.abort(new DOMException("timed out", "TimeoutError")),
      );
    const { result } = await scripted((_url, init) => {
      init.signal?.throwIfAborted();
      return Response.json(user());
    });
    expect(result).toEqual({ status: "unavailable" });
    expect(timeout).toHaveBeenCalledWith(3_000);
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
    expect(loggedOutcome()).toBe("refused_identity");
  });

  it("refuses a disabled and an unknown client before Auth and before a count", async () => {
    for (const client of [
      await fixtures.client({ allow: { enabled: false } }),
      randomUUID(),
    ]) {
      const { result, fetchUser } = await scripted(
        () => Response.json(user()),
        { client },
      );
      expect(result).toEqual({ status: "refused" });
      expect(loggedOutcome()).toBe("refused_client");
      expect(fetchUser).not.toHaveBeenCalled();
      expect(
        await db`select 1 from public.assistant_request_windows where subject like ${`%${client}`}`,
      ).toHaveLength(0);
    }
  });

  it("refuses a host before Auth, and a prepared host email in another case after it", async () => {
    await db`insert into auth.users(id,email,aud,role,created_at,updated_at)
      values(${userId},${user().email},'authenticated','authenticated',now(),now())`;
    fixtures.defer(() => db`delete from auth.users where id=${userId}`);
    await fixtures.host({ authUserId: userId });
    const bound = await scripted(() => Response.json(user()));
    expect(bound.result).toEqual({ status: "refused" });
    expect(loggedOutcome()).toBe("refused_host");
    expect(bound.fetchUser).not.toHaveBeenCalled();

    userId = randomUUID();
    await fixtures.host({ preparedEmail: user().email });
    const prepared = await scripted(() =>
      Response.json(user({ email: user().email.toUpperCase() })),
    );
    expect(prepared.result).toEqual({ status: "refused" });
    expect(loggedOutcome()).toBe("refused_host");
    expect(prepared.fetchUser).toHaveBeenCalledTimes(1);
  });

  it("limits before Auth, and recovers when the window ends", async () => {
    const client = await fixtures.client();
    await db`insert into public.assistant_request_windows(subject,span,started_at,requests)
      values(${`account:${userId}:${client}`},'minute',${NOW},60)`;
    const clock = new FakeClock(NOW);
    const limited = await scripted(() => Response.json(user()), {
      client,
      clock,
    });
    expect(limited.result).toEqual({
      status: "limited",
      assistant: "claude",
      retryAfter: 60,
    });
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
