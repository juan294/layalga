import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { claimHostIdentity } from "./host-identity";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false, max: 2 });

describe("host identity claims", () => {
  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("claims the explicitly mapped host without depending on row order", async () => {
    const suffix = randomUUID();
    const userId = randomUUID();
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Identity ${suffix}`}, 'Europe/Madrid')
      returning id
    `;
    if (!home) throw new Error("Failed to seed identity home");
    const hosts = await sql<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home.id}, 'Earlier host', 'en'), (${home.id}, 'Mapped host', 'es')
      returning id
    `;
    const target = hosts[1];
    if (!target) throw new Error("Failed to seed mapped host");

    try {
      await sql`
        insert into auth.users (id, email, aud, role, created_at, updated_at)
        values (${userId}, ${` HOST.${suffix}@Example.COM `}, 'authenticated', 'authenticated', now(), now())
      `;
      await sql`
        insert into public.host_identity_claims (
          normalized_email, host_id, home_id
        ) values (${`host.${suffix}@example.com`}, ${target.id}, ${home.id})
      `;

      expect(
        await claimHostIdentity(
          sql,
          userId,
          ` HOST.${suffix}@Example.COM `,
        ),
      ).toBe(target.id);
      const [claimed] = await sql<{ auth_user_id: string | null }[]>`
        select auth_user_id from public.hosts where id = ${target.id}
      `;
      expect(claimed?.auth_user_id).toBe(userId);
    } finally {
      await sql`delete from auth.users where id = ${userId}`;
      await sql`delete from public.homes where id = ${home.id}`;
    }
  });

  it("fails closed when one authenticated user conflicts with another host claim", async () => {
    const suffix = randomUUID();
    const userId = randomUUID();
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Conflict ${suffix}`}, 'Europe/Madrid')
      returning id
    `;
    if (!home) throw new Error("Failed to seed conflict home");
    const hosts = await sql<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home.id}, 'First', 'en'), (${home.id}, 'Second', 'es')
      returning id
    `;
    if (!hosts[0] || !hosts[1]) throw new Error("Failed to seed conflict hosts");

    try {
      await sql`
        insert into auth.users (id, email, aud, role, created_at, updated_at)
        values (${userId}, ${`first.${suffix}@example.com`}, 'authenticated', 'authenticated', now(), now())
      `;
      await sql`
        insert into public.host_identity_claims (
          normalized_email, host_id, home_id, auth_user_id
        ) values
          (${`first.${suffix}@example.com`}, ${hosts[0].id}, ${home.id}, ${userId}),
          (${`second.${suffix}@example.com`}, ${hosts[1].id}, ${home.id}, null)
      `;
      await sql`
        update public.hosts set auth_user_id = ${userId} where id = ${hosts[0].id}
      `;

      await expect(
        claimHostIdentity(
          sql,
          userId,
          `second.${suffix}@example.com`,
        ),
      ).rejects.toThrow(/conflict/i);
      const [second] = await sql<{ auth_user_id: string | null }[]>`
        select auth_user_id from public.hosts where id = ${hosts[1].id}
      `;
      expect(second?.auth_user_id).toBeNull();
    } finally {
      await sql`delete from auth.users where id = ${userId}`;
      await sql`delete from public.homes where id = ${home.id}`;
    }
  });
});
