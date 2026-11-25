import { sqlClient, type DatabaseClient } from "@/core/db/client";

const ACCOUNT_MINUTE_LIMIT = 60;
const ACCOUNT_DAY_LIMIT = 1_000;
const CLIENT_MINUTE_LIMIT = 1_200;

export type RequestAllowance =
  { allowed: true } | { allowed: false; retryAfter: number };

/**
 * Counts one request of a connected assistant in one statement. Each part
 * reads the part before it, so every caller locks the account minute, the
 * account day and then the shared client window. An account over its own limit
 * does not spend the client window.
 */
export async function takeRequest(
  database: DatabaseClient,
  userId: string,
  clientId: string,
  now: Date,
): Promise<RequestAllowance> {
  const sql = sqlClient(database);
  const account = `account:${userId}:${clientId}`;
  const client = `client:${clientId}`;
  const at = sql`${now.toISOString()}::timestamptz`;
  // Not '1 day', whose length depends on the time zone of the session.
  const span = sql`case current.span when 'minute' then interval '1 minute' else interval '24 hours' end`;
  const count = sql`
    on conflict (subject, span) do update set
      requests = case when current.started_at + ${span} <= ${at}
        then 1 else current.requests + 1 end,
      started_at = case when current.started_at + ${span} <= ${at}
        then ${at} else current.started_at end
    returning requests,
      ceil(extract(epoch from current.started_at + ${span} - ${at}))::integer as ends_in
  `;
  const [row] = await sql<{ retry_after: number }[]>`
    with account_minute as (
      insert into public.assistant_request_windows as current (subject, span, started_at, requests)
      values (${account}, 'minute', ${at}, 1)
      ${count}
    ), account_day as (
      insert into public.assistant_request_windows as current (subject, span, started_at, requests)
      select ${account}, 'day', ${at}, 1 from account_minute
      ${count}
    ), client_minute as (
      insert into public.assistant_request_windows as current (subject, span, started_at, requests)
      select ${client}, 'minute', ${at}, 1 from account_minute, account_day
      where account_minute.requests <= ${ACCOUNT_MINUTE_LIMIT}::integer
        and account_day.requests <= ${ACCOUNT_DAY_LIMIT}::integer
      ${count}
    )
    select coalesce(max(ends_in), 0)::integer as retry_after from (
      select ends_in from account_minute where requests > ${ACCOUNT_MINUTE_LIMIT}::integer
      union all
      select ends_in from account_day where requests > ${ACCOUNT_DAY_LIMIT}::integer
      union all
      select ends_in from client_minute where requests > ${CLIENT_MINUTE_LIMIT}::integer
    ) as exceeded
  `;
  if (!row) throw new Error("The request was not counted");
  return row.retry_after === 0
    ? { allowed: true }
    : { allowed: false, retryAfter: row.retry_after };
}
