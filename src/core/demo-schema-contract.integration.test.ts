import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import postgres, { type TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const db = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  { max: 1, prepare: false },
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261015084815_drop_demo_schema.sql",
    import.meta.url,
  ),
  "utf8",
);

class Rollback extends Error {}

/** Runs `body` inside a transaction that is always rolled back. */
function inRollback(body: (tx: TransactionSql) => Promise<void>) {
  return db.begin(async (tx) => {
    await body(tx);
    throw new Rollback();
  });
}

/** Restores a minimal pre-contract shape, then runs `body`, rolled back. */
function withPreContractShape(body: (tx: TransactionSql) => Promise<void>) {
  return inRollback(async (tx) => {
    await tx`alter table public.homes add column demo boolean not null default false`;
    await tx`create table public.demo_clock (home_id uuid primary key references public.homes(id) on delete cascade)`;
    await body(tx);
  });
}

async function columnExists(tx: TransactionSql): Promise<boolean> {
  const [row] = await tx<{ exists: boolean }[]>`
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'homes' and column_name = 'demo'
    ) as exists
  `;
  return row?.exists ?? false;
}

describe("demo schema contract migration", () => {
  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("fails closed while a demo home still exists", async () => {
    await expect(
      withPreContractShape(async (tx) => {
        await tx`insert into public.homes (name, timezone, demo) values (${`Contract ${randomUUID()}`}, 'Europe/Madrid', true)`;
        await tx.unsafe(migration);
      }),
    ).rejects.toThrow("demo homes still exist; apply the conversion first");
  });

  it("drops the demo column and tables once every home is converted", async () => {
    await expect(
      withPreContractShape(async (tx) => {
        await tx`insert into public.homes (name, timezone) values (${`Contract ${randomUUID()}`}, 'Europe/Madrid')`;
        await tx.unsafe(migration);
        expect(await columnExists(tx)).toBe(false);
        const [tables] = await tx<{ clock: string | null; ledger: string | null }[]>`
          select
            to_regclass('public.demo_clock')::text as clock,
            to_regclass('private.review_access_events')::text as ledger
        `;
        expect(tables).toEqual({ clock: null, ledger: null });
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });

  it("leaves no demo predicate or demo helper behind", async () => {
    const [retention] = await db<{ source: string }[]>`
      select prosrc as source from pg_proc
      where proname = 'apply_data_retention_before_guest_delivery'
    `;
    expect(retention?.source).toBeDefined();
    expect(retention?.source).not.toMatch(/\bdemo\b/);
    const [helpers] = await db<{ count: number }[]>`
      select count(*)::int as count from pg_proc
      where proname = 'restore_demo_identity_claims'
    `;
    expect(helpers?.count).toBe(0);
    const [usage] = await db<{ allowed: boolean }[]>`
      select has_schema_privilege('layalga_web_runtime', 'private', 'usage') as allowed
    `;
    expect(usage?.allowed).toBe(false);
  });

  it("is a no-op when applied again", async () => {
    await expect(
      inRollback(async (tx) => {
        await tx.unsafe(migration);
        expect(await columnExists(tx)).toBe(false);
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });
});
