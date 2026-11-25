import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import { createFixtureHousehold } from "./fixture-household";

/**
 * One matrix for both implementations of "this account belongs to a host":
 * `isHostAccount` in TypeScript and the access token hook in SQL.
 */
export const HOST_ACCOUNT_CASES: readonly {
  name: string;
  bound?: boolean;
  /** The email prepared in host_identity_claims: the account's own, or another. */
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

type FixtureHost = Awaited<ReturnType<typeof createFixtureHost>>;

/** One host of a new household, bound to an account or prepared for an email. */
export async function createFixtureHost(
  sql: Sql,
  {
    authUserId,
    preparedEmail,
  }: { authUserId?: string; preparedEmail?: string } = {},
) {
  const { homeId, hostIds, cleanup } = await createFixtureHousehold(sql, {
    label: `Assistant host ${randomUUID()}`,
    tokenSecret: "no guest link is issued",
    rooms: [],
    parties: [],
  });
  const hostId = hostIds[0]!;
  try {
    if (authUserId)
      await sql`update public.hosts set auth_user_id=${authUserId} where id=${hostId}`;
    if (preparedEmail)
      await sql`insert into public.host_identity_claims(normalized_email,host_id,home_id)
        values(${preparedEmail},${hostId},${homeId})`;
  } catch (error) {
    await cleanup();
    throw error;
  }
  return { hostId, cleanup };
}

export async function withHostAccountCase<T>(
  sql: Sql,
  entry: (typeof HOST_ACCOUNT_CASES)[number],
  run: (account: { userId: string; email: string }) => Promise<T>,
): Promise<T> {
  const userId = randomUUID();
  const address = `host-case-${userId}@fixture.test`;
  await sql`insert into auth.users(id,email,aud,role,created_at,updated_at)
    values(${userId},${address},'authenticated','authenticated',now(),now())`;
  let host: FixtureHost | undefined;
  try {
    host = await createFixtureHost(sql, {
      authUserId: entry.bound ? userId : undefined,
      preparedEmail:
        entry.prepared &&
        (entry.prepared === "same" ? address : `other-${address}`),
    });
    return await run({ userId, email: entry.email?.(address) ?? address });
  } finally {
    await host?.cleanup();
    await sql`delete from auth.users where id=${userId}`;
  }
}
