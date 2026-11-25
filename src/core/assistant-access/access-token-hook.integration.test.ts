import { randomUUID } from "node:crypto";

import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  HOST_ACCOUNT_CASES,
  withHostAccountCase,
} from "@/test-support/host-account-cases";
import {
  FIXTURE_CALLBACK,
  allowClient,
  authCall,
  codeFlow,
  createAssistantUser,
  deleteClient,
  localAdmin,
  localSupabase,
  refreshClient,
  registerClient,
  tokenClaims,
  webSignIn,
  type FixtureUser,
} from "@/test-support/assistant-oauth";

import { ASSISTANT_AUDIENCE } from "./audience";

const REFUSAL = {
  error: { http_code: 403, message: "assistant connection refused" },
};
const HOOK_TABLES = ["assistant_clients", "hosts", "host_identity_claims"];

const db = postgres(localSupabase().databaseUrl, { max: 2, prepare: false });
const admin = localAdmin();
const cleanups: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
afterAll(async () => {
  await db.end({ timeout: 5 });
  await admin.end({ timeout: 5 });
});

function hookEvent({
  userId = randomUUID(),
  email = `event-${userId}@fixture.test`,
  method = "token_refresh",
  claims = {},
}: {
  userId?: string | null;
  email?: string;
  method?: string;
  claims?: Record<string, unknown>;
} = {}) {
  return {
    user_id: userId,
    authentication_method: method,
    claims: {
      iss: localSupabase().issuer,
      sub: userId,
      aud: "authenticated",
      exp: 1_800_003_600,
      iat: 1_800_000_000,
      email,
      phone: "+34600000000",
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: { full_name: "Synthetic Guest" },
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "oauth", timestamp: 1_800_000_000 }],
      session_id: randomUUID(),
      is_anonymous: false,
      ...claims,
    },
  };
}

async function callHook(event: unknown, sql: Sql | TransactionSql = admin) {
  const run = async (tx: TransactionSql) => {
    await tx`set local role supabase_auth_admin`;
    const [row] = await tx<{ result: Record<string, unknown> }[]>`
      select private.access_token_hook(${JSON.stringify(event)}::text::jsonb) as result`;
    return row!.result;
  };
  return "begin" in sql ? sql.begin(run) : run(sql as TransactionSql);
}

async function newClient(
  allow: { redirectUri?: string; enabled?: boolean } | null = {},
  registered?: string,
) {
  const id = await registerClient(admin, registered);
  cleanups.push(() => deleteClient(admin, id));
  if (allow) await allowClient(admin, id, allow);
  return id;
}

async function newUser(options?: { google?: boolean }): Promise<FixtureUser> {
  const user = await createAssistantUser(db, options);
  cleanups.push(() => db`delete from auth.users where id=${user.id}`);
  return user;
}

async function newHost() {
  const [home] = await db<{ id: string }[]>`
    insert into public.homes(name,timezone) values(${`Hook ${randomUUID()}`},'Europe/Madrid') returning id`;
  cleanups.push(() => db`delete from public.homes where id=${home!.id}`);
  const [host] = await db<{ id: string }[]>`
    insert into public.hosts(home_id,display_name,locale) values(${home!.id},'Hook host','en') returning id`;
  return host!.id;
}

describe("access token hook: web tokens", () => {
  it.each(["password", "oauth", "token_refresh", "recovery", "otp", "totp"])(
    "returns a %s event unchanged",
    async (method) => {
      const event = JSON.stringify(hookEvent({ method }));
      const [row] = await db<{ same: boolean; text: string }[]>`
        select private.access_token_hook(e)::text = e::text as same,
          private.access_token_hook(e)::text as text
        from (select ${event}::text::jsonb as e) input`;
      expect(row).toMatchObject({ same: true });
      expect(JSON.parse(row!.text)).toEqual(JSON.parse(event));
    },
  );

  it.each(["{}", '{"claims":null}', '{"claims":[]}', "[]", "null", '"text"'])(
    "does not raise on the malformed event %s",
    async (event) => {
      const [row] = await db<{ same: boolean }[]>`
        select private.access_token_hook(e) = e as same from (select ${event}::text::jsonb as e) input`;
      expect(row?.same).toBe(true);
    },
  );

  it("needs no table, while a client token is refused without them", async () => {
    const client = await newClient();
    const web = hookEvent({ method: "password" });
    const assistant = hookEvent({ claims: { client_id: client } });
    expect(await callHook(assistant)).toHaveProperty(
      "claims.client_id",
      client,
    );

    const rollback = new Error("rollback");
    await expect(
      admin.begin(async (tx) => {
        for (const table of HOOK_TABLES) {
          await tx`revoke all on ${tx(`public.${table}`)} from supabase_auth_admin`;
          const columns = await tx<{ name: string }[]>`
            select attname as name from pg_attribute
            where attrelid=${`public.${table}`}::regclass and attnum > 0 and not attisdropped`;
          for (const { name } of columns)
            await tx`revoke all (${tx(name)}) on ${tx(`public.${table}`)} from supabase_auth_admin`;
          await tx`alter table ${tx(`public.${table}`)} rename to ${tx(`${table}_gone`)}`;
        }
        expect(await callHook(web, tx)).toEqual(web);
        expect(await callHook(assistant, tx)).toEqual(REFUSAL);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});

describe("access token hook: client tokens", () => {
  it("issues the assistant audience to an enabled client for a guest", async () => {
    const client = await newClient();
    const event = hookEvent({
      method: "oauth_provider/authorization_code",
      claims: { client_id: client },
    });
    const { claims } = (await callHook(event)) as {
      claims: Record<string, unknown>;
    };
    const { iss, sub, exp, iat, aal, session_id, is_anonymous } = event.claims;
    expect(claims).toEqual({
      iss,
      sub,
      exp,
      iat,
      aal,
      session_id,
      is_anonymous,
      client_id: client,
      aud: ASSISTANT_AUDIENCE,
      role: "layalga_assistant",
      email: "",
      phone: "",
    });
  });

  it("keeps the role name free of a database role", async () => {
    expect(
      await db`select 1 from pg_roles where rolname='layalga_assistant'`,
    ).toHaveLength(0);
  });

  const other = "https://claude.ai/api/mcp/other";
  it.each<[string, () => Promise<string>]>([
    ["disabled", () => newClient({ enabled: false })],
    ["not on the allowlist", () => newClient(null)],
    [
      "registered with two callbacks",
      () => newClient({}, `${FIXTURE_CALLBACK},${other}`),
    ],
    ["registered with another callback", () => newClient({}, other)],
    [
      "allowlisted with another callback",
      () => newClient({ redirectUri: other }),
    ],
    [
      "registered on a lookalike domain",
      () =>
        newClient({}, "https://claude.ai.evil.example/api/mcp/auth_callback"),
    ],
    [
      "deleted",
      async () => {
        const id = await newClient();
        await admin`update auth.oauth_clients set deleted_at=now() where id=${id}`;
        return id;
      },
    ],
    [
      "removed from Auth",
      async () => {
        const id = await newClient();
        await admin`delete from auth.oauth_clients where id=${id}`;
        return id;
      },
    ],
  ])("refuses a client that is %s", async (_name, create) => {
    const client = await create();
    expect(
      await callHook(hookEvent({ claims: { client_id: client } })),
    ).toEqual(REFUSAL);
  });

  it.each<[string, unknown]>([
    ["malformed", "not-a-uuid"],
    ["null", null],
    ["empty", ""],
    ["an object", {}],
    ["a list", []],
  ])("refuses a client_id that is %s", async (_name, clientId) => {
    expect(
      await callHook(hookEvent({ claims: { client_id: clientId } })),
    ).toEqual(REFUSAL);
  });

  it.each([
    "oauth_provider/authorization_code",
    "oauth_provider/refresh_token",
    "oauth_provider/",
  ])("refuses the method %s without a client_id", async (method) => {
    expect(await callHook(hookEvent({ method }))).toEqual(REFUSAL);
  });

  it("refuses an event without a usable user or email", async () => {
    const client = await newClient();
    const claims = { client_id: client };
    for (const event of [
      hookEvent({ userId: null, email: "a@fixture.test", claims }),
      hookEvent({ userId: "not-a-uuid", email: "a@fixture.test", claims }),
      hookEvent({ email: "", claims }),
      hookEvent({ claims: { ...claims, email: null } }),
    ])
      expect(await callHook(event)).toEqual(REFUSAL);
  });

  it.each(HOST_ACCOUNT_CASES)(
    "applies the host rule to $name",
    async (entry) => {
      const client = await newClient();
      await withHostAccountCase(db, entry, async ({ userId, email }) => {
        const result = await callHook(
          hookEvent({ userId, email, claims: { client_id: client } }),
        );
        if (entry.host) expect(result).toEqual(REFUSAL);
        else expect(result).toHaveProperty("claims.aud", ASSISTANT_AUDIENCE);
      });
    },
  );
});

describe("access token hook on local Auth", { timeout: 30_000 }, () => {
  it("leaves web sign-in and refresh unchanged", async () => {
    const user = await newUser();
    const refreshed = await authCall(
      "POST",
      "/auth/v1/token?grant_type=refresh_token",
      {
        json: { refresh_token: user.refreshToken },
      },
    );
    expect(refreshed.status).toBe(200);
    for (const token of [user.accessToken, refreshed.body.access_token]) {
      const claims = tokenClaims(token);
      expect(claims).toMatchObject({
        sub: user.id,
        aud: "authenticated",
        role: "authenticated",
        email: user.email,
        phone: "",
        amr: [{ method: "password" }],
        app_metadata: { provider: "email" },
        user_metadata: { email: user.email },
      });
      expect(claims).not.toHaveProperty("client_id");
    }
  });

  it("gives an enabled client the assistant token for openid, and keeps it on refresh", async () => {
    const user = await newUser();
    const client = await newClient();
    const issued = await codeFlow(user, client);
    expect(issued.status).toBe(200);
    const refreshed = await refreshClient(client, issued.body.refresh_token);
    expect(refreshed.status).toBe(200);
    for (const answer of [issued, refreshed]) {
      const claims = tokenClaims(answer.body.access_token);
      expect(claims).toMatchObject({
        sub: user.id,
        client_id: client,
        aud: ASSISTANT_AUDIENCE,
        role: "layalga_assistant",
        iss: localSupabase().issuer,
        email: "",
        phone: "",
      });
      for (const name of ["user_metadata", "app_metadata", "amr"])
        expect(claims).not.toHaveProperty(name);
      expect(JSON.stringify(claims)).not.toContain(user.email);
    }
    const idToken = tokenClaims(issued.body.id_token);
    expect(idToken).toMatchObject({ sub: user.id, aud: client });
    expect(JSON.stringify(idToken)).not.toContain(user.email);
  });

  it("refuses the code exchange of a disabled client and of a host", async () => {
    const user = await newUser();
    const disabled = await codeFlow(user, await newClient({ enabled: false }));
    expect(disabled.status).toBe(403);
    expect(disabled.body).not.toHaveProperty("access_token");

    const client = await newClient();
    const hostId = await newHost();
    await db`update public.hosts set auth_user_id=${user.id} where id=${hostId}`;
    const host = await codeFlow(user, client);
    expect(host.status).toBe(403);
    expect(host.body).not.toHaveProperty("access_token");
    expect(tokenClaims((await webSignIn(user)).accessToken).aud).toBe(
      "authenticated",
    );
  });

  it("refuses refresh while a guest is a host, and accepts the same token afterwards", async () => {
    const user = await newUser();
    const client = await newClient();
    const issued = await codeFlow(user, client);
    const hostId = await newHost();
    await db`update public.hosts set auth_user_id=${user.id} where id=${hostId}`;
    const refused = await refreshClient(client, issued.body.refresh_token);
    expect(refused.status).toBe(403);
    expect(refused.body).not.toHaveProperty("access_token");
    // The refusal rolls back, so this is not the reuse interval of a spent token.
    const session = tokenClaims(issued.body.access_token).session_id as string;
    expect(
      await admin`select revoked from auth.refresh_tokens where session_id=${session}`,
    ).toEqual([{ revoked: false }]);
    await db`update public.hosts set auth_user_id=null where id=${hostId}`;
    const again = await refreshClient(client, issued.body.refresh_token);
    expect(again.status).toBe(200);
    expect(tokenClaims(again.body.access_token).aud).toBe(ASSISTANT_AUDIENCE);
  });

  it("keeps the client out of the Data API, also after a grant to authenticated", async () => {
    const user = await newUser();
    const issued = await codeFlow(user, await newClient());
    const token = String(issued.body.access_token);
    const probe = `assistant_probe_${randomUUID().replaceAll("-", "")}`;
    await db`create table ${db(`public.${probe}`)} (id integer)`;
    cleanups.push(async () => {
      await db`drop table ${db(`public.${probe}`)}`;
      await db`notify pgrst, 'reload schema'`;
    });
    await db`revoke all on ${db(`public.${probe}`)} from anon, authenticated, service_role`;
    await db`grant select on ${db(`public.${probe}`)} to authenticated`;
    await db`notify pgrst, 'reload schema'`;
    await expect
      .poll(
        async () =>
          (
            await authCall("GET", `/rest/v1/${probe}`, {
              token: user.accessToken,
            })
          ).status,
        { timeout: 10_000 },
      )
      .toBe(200);

    const tables = await db<{ name: string }[]>`
      select tablename as name from pg_tables where schemaname='public'`;
    expect(tables.length).toBeGreaterThan(20);
    for (const { name } of tables) {
      const answer = await authCall("GET", `/rest/v1/${name}?limit=1`, {
        token,
      });
      expect(answer.body, name).toMatchObject({
        message: 'role "layalga_assistant" does not exist',
      });
      expect(answer.status, name).toBe(401);
    }
  });

  it("lets the substituted role read its identity, while grants stay with the owner", async () => {
    const user = await newUser();
    const client = await newClient();
    const issued = await codeFlow(user, client);
    const token = String(issued.body.access_token);
    expect((await authCall("GET", "/auth/v1/user", { token })).body.id).toBe(
      user.id,
    );
    expect(
      (await authCall("GET", "/auth/v1/user/oauth/grants", { token })).status,
    ).toBe(403);
    const revoke = `/auth/v1/user/oauth/grants?client_id=${client}`;
    expect((await authCall("DELETE", revoke, { token })).status).toBe(403);
    expect((await authCall("GET", "/auth/v1/user", { token })).status).toBe(
      200,
    );

    expect(
      (await authCall("DELETE", revoke, { token: user.accessToken })).status,
    ).toBeLessThan(300);
    expect(
      (await authCall("GET", "/auth/v1/user", { token })).body.error_code,
    ).toBe("session_not_found");
    expect(
      (await refreshClient(client, issued.body.refresh_token)).status,
    ).toBe(400);
  });
});
