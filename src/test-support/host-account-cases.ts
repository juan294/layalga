import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

/**
 * One matrix for both implementations of "this account belongs to a host":
 * `isHostAccount` in TypeScript and the access token hook in SQL.
 */
export const HOST_ACCOUNT_CASES: readonly {
  name: string;
  bound?: boolean;
  /** Prepared in host_identity_claims; `@` stands for the account's address. */
  prepared?: "same" | "other";
  email?: (address: string) => string;
  host: boolean;
}[] = [
  { name: "a guest", host: false },
  {
    name: "a guest while another email is prepared",
    prepared: "other",
    host: false,
  },
  { name: "a bound host", bound: true, host: true },
  {
    name: "a bound host whose prepared email differs",
    bound: true,
    prepared: "other",
    host: true,
  },
  { name: "a prepared host email", prepared: "same", host: true },
  {
    name: "a prepared host email in another case",
    prepared: "same",
    email: (address) => address.toUpperCase(),
    host: true,
  },
  {
    name: "a prepared host email with spaces",
    prepared: "same",
    email: (address) => ` ${address} `,
    host: true,
  },
];

export async function withHostAccountCase<T>(
  sql: Sql,
  entry: (typeof HOST_ACCOUNT_CASES)[number],
  run: (account: { userId: string; email: string }) => Promise<T>,
): Promise<T> {
  const userId = randomUUID();
  const address = `host-case-${userId}@fixture.test`;
  await sql`insert into auth.users(id,email,aud,role,created_at,updated_at)
    values(${userId},${address},'authenticated','authenticated',now(),now())`;
  const [home] = await sql<{ id: string }[]>`
    insert into public.homes(name,timezone) values(${`Host case ${userId}`},'Europe/Madrid') returning id`;
  try {
    const [host] = await sql<{ id: string }[]>`
      insert into public.hosts(home_id,display_name,locale,auth_user_id)
      values(${home!.id},'Case host','en',${entry.bound ? userId : null}) returning id`;
    if (entry.prepared)
      await sql`insert into public.host_identity_claims(normalized_email,host_id,home_id)
        values(${entry.prepared === "same" ? address : `other-${address}`},${host!.id},${home!.id})`;
    return await run({ userId, email: entry.email?.(address) ?? address });
  } finally {
    await sql`delete from public.homes where id=${home!.id}`;
    await sql`delete from auth.users where id=${userId}`;
  }
}
