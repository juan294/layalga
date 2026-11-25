import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { applyDataRetention } from "@/core/data-retention";
import { localAdmin, localSupabase } from "@/test-support/local-supabase";

const db = postgres(localSupabase().databaseUrl, { max: 1, prepare: false });
const PRIVILEGES = [
  "select",
  "insert",
  "update",
  "delete",
  "truncate",
  "references",
  "trigger",
  "maintain",
];
const HOOK = "private.access_token_hook(jsonb)";

async function tablePrivileges(role: string, table: string) {
  const rows = await db<{ privilege: string }[]>`
    select p as privilege from unnest(${PRIVILEGES}::text[]) p
    where has_table_privilege(${role},${`public.${table}`},p)`;
  return rows.map((row) => row.privilege);
}

async function readableColumns(role: string, table: string) {
  const rows = await db<{ name: string }[]>`
    select attname as name from pg_attribute
    where attrelid=${`public.${table}`}::regclass and attnum > 0 and not attisdropped
      and has_column_privilege(${role},attrelid,attnum,'select') order by attnum`;
  return rows.map((row) => row.name);
}

afterAll(async () => {
  await db.end({ timeout: 5 });
});

describe("assistant access schema", () => {
  it.each([
    ["assistant_clients", "layalga_web_runtime", ["select"]],
    ["assistant_clients", "supabase_auth_admin", ["select"]],
    [
      "assistant_request_windows",
      "layalga_web_runtime",
      ["select", "insert", "update"],
    ],
    ["assistant_request_windows", "supabase_auth_admin", []],
    ["hosts", "supabase_auth_admin", []],
    ["host_identity_claims", "supabase_auth_admin", []],
    ...[
      "layalga_agent_runtime",
      "anon",
      "authenticated",
      "service_role",
    ].flatMap((role) =>
      ["assistant_clients", "assistant_request_windows"].map(
        (table): [string, string, string[]] => [table, role, []],
      ),
    ),
  ] as [string, string, string[]][])(
    "%s grants %s exactly %j",
    async (table, role, expected) => {
      expect(await tablePrivileges(role, table)).toEqual(expected);
    },
  );

  it.each(["layalga_agent_runtime", "anon", "authenticated", "service_role"])(
    "denies %s when it reads or writes",
    async (role) => {
      const sql = localAdmin(role);
      try {
        for (const table of [
          "assistant_clients",
          "assistant_request_windows",
        ]) {
          const name = sql(`public.${table}`);
          for (const statement of [
            () => sql`select 1 from ${name}`,
            () => sql`insert into ${name} default values`,
            () => sql`delete from ${name}`,
          ])
            await expect(statement()).rejects.toMatchObject({ code: "42501" });
        }
        await expect(
          sql`select private.access_token_hook('{}'::jsonb)`,
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
  );

  it("keeps the web runtime from activating a client or erasing a count", async () => {
    const web = localAdmin("layalga_web_runtime");
    try {
      expect(await web`select 1 from public.assistant_clients`).toBeDefined();
      for (const statement of [
        () =>
          web`insert into public.assistant_clients(client_id,assistant,redirect_uri)
            values(${randomUUID()},'claude','https://claude.ai/a')`,
        () => web`update public.assistant_clients set enabled=true`,
        () => web`delete from public.assistant_clients`,
        () => web`delete from public.assistant_request_windows`,
        () => web`select private.access_token_hook('{}'::jsonb)`,
      ])
        await expect(statement()).rejects.toMatchObject({ code: "42501" });
    } finally {
      await web.end({ timeout: 5 });
    }
  });

  it("lets Auth read one column of each host table", async () => {
    expect(await readableColumns("supabase_auth_admin", "hosts")).toEqual([
      "auth_user_id",
    ]);
    expect(
      await readableColumns("supabase_auth_admin", "host_identity_claims"),
    ).toEqual(["normalized_email"]);
  });

  it("enables row security with one policy for each reader", async () => {
    const secured = await db`select 1 from pg_class where relrowsecurity
      and oid in ('public.assistant_clients'::regclass,'public.assistant_request_windows'::regclass)`;
    expect(secured).toHaveLength(2);
    const policies = await db<{ name: string }[]>`
      select tablename || ':' || cmd || ':' || array_to_string(roles,',') as name from pg_policies
      where schemaname='public' and (tablename like 'assistant%' or 'supabase_auth_admin' = any(roles))
      order by 1`;
    expect(policies.map((row) => row.name)).toEqual([
      "assistant_clients:SELECT:layalga_web_runtime",
      "assistant_clients:SELECT:supabase_auth_admin",
      "assistant_request_windows:ALL:layalga_web_runtime",
      "host_identity_claims:SELECT:supabase_auth_admin",
      "hosts:SELECT:supabase_auth_admin",
    ]);
  });

  it("lets only Auth run the hook, with the caller's own rights", async () => {
    const rows = await db<{ role: string }[]>`
      select r as role from unnest(array['public','anon','authenticated','service_role','layalga_web_runtime',
        'layalga_agent_runtime','layalga_web','layalga_agent','supabase_auth_admin']) r
      where has_function_privilege(r,${HOOK},'execute')`;
    expect(rows.map((row) => row.role)).toEqual(["supabase_auth_admin"]);
    const [hook] =
      await db`select prosecdef, provolatile, proconfig from pg_proc where oid=${HOOK}::regprocedure`;
    expect(hook).toEqual({
      prosecdef: false,
      provolatile: "s",
      proconfig: ['search_path=""'],
    });
  });

  it("gives anon and authenticated no table, column or function in public", async () => {
    const tables = await db`
      select r, c.relname from pg_class c, unnest(array['anon','authenticated']) r
      where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','f')
        and (has_table_privilege(r,c.oid,'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege(r,c.oid,'select,insert,update,references'))`;
    expect(tables).toEqual([]);
    const functions = await db`
      select r, p.oid::regprocedure from pg_proc p, unnest(array['anon','authenticated']) r
      where p.pronamespace='public'::regnamespace and has_function_privilege(r,p.oid,'execute')`;
    expect(functions).toEqual([]);
  });

  it("disables a new client, and accepts one exact https callback", async () => {
    const id = randomUUID();
    const insert = (redirectUri: string, assistant = "claude") =>
      db`insert into public.assistant_clients(client_id,assistant,redirect_uri) values(${id},${assistant},${redirectUri}) returning enabled`;
    try {
      expect(await insert("https://claude.ai/api/mcp/auth_callback")).toEqual([
        { enabled: false },
      ]);
      await db`delete from public.assistant_clients where client_id=${id}`;
      for (const callback of [
        "http://claude.ai/callback",
        "https://claude.ai/a,https://evil.example/b",
        "https://claude.ai/a?next=b",
        "https://claude.ai/a#b",
        "https://claude.ai/a b",
        "https://",
        `https://claude.ai/${"a".repeat(500)}`,
        "cursor://callback",
      ])
        await expect(insert(callback), callback).rejects.toMatchObject({
          code: "23514",
        });
      await expect(
        insert("https://claude.ai/a", "other"),
      ).rejects.toMatchObject({
        code: "23514",
      });
    } finally {
      await db`delete from public.assistant_clients where client_id=${id}`;
    }
  });

  it("bounds the request windows", async () => {
    const subject = `bounds:${randomUUID()}`;
    try {
      const insert = (id: string, span: string, requests: number) =>
        db`insert into public.assistant_request_windows(subject,span,started_at,requests) values(${id},${span},now(),${requests})`;
      await expect(insert(subject, "hour", 1)).rejects.toMatchObject({
        code: "23514",
      });
      await expect(insert(subject, "day", 0)).rejects.toMatchObject({
        code: "23514",
      });
      await expect(
        insert(subject.padEnd(101, "a"), "day", 1),
      ).rejects.toMatchObject({
        code: "23514",
      });
    } finally {
      await db`delete from public.assistant_request_windows where subject like ${`${subject}%`}`;
    }
  });

  it("deletes request windows two days after they start", async () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const subject = `retention:${randomUUID()}`;
    const started = (hours: number) =>
      new Date(now.getTime() - hours * 3_600_000);
    const rollback = new Error("rollback");
    await expect(
      db.begin(async (tx) => {
        await tx`delete from public.assistant_request_windows`;
        await tx`insert into public.assistant_request_windows(subject,span,started_at,requests)
          values(${subject},'day',${started(49)},3),(${subject},'minute',${started(47)},1)`;
        const result = await applyDataRetention(
          tx as unknown as typeof db,
          now,
        );
        expect(result).toMatchObject({
          deletedAssistantWindows: 1,
          deletedStayRequests: expect.any(Number),
        });
        expect(
          await tx`select span from public.assistant_request_windows where subject=${subject}`,
        ).toEqual([{ span: "minute" }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
