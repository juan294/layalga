import { sqlClient, type DatabaseClient } from "@/core/db/client";

const SPAN_SECONDS = { minute: 60, day: 86_400 } as const;
const ACCOUNT_MINUTE_LIMIT = 60;
const ACCOUNT_DAY_LIMIT = 1_000;
const CLIENT_MINUTE_LIMIT = 1_200;

type Span = keyof typeof SPAN_SECONDS;
type Window = { subject: string; span: Span; limit: number };

export type RequestAllowance =
  { allowed: true } | { allowed: false; retryAfter: number };

/**
 * Counts one request of a connected assistant. Every caller locks its windows
 * in the same order, and the shared client window last. An account over its
 * own limit does not spend the client window.
 */
export async function takeRequest(
  database: DatabaseClient,
  userId: string,
  clientId: string,
  now: Date,
): Promise<RequestAllowance> {
  const account = `account:${userId}:${clientId}`;
  return sqlClient(database).begin(async (transaction) => {
    const take = async ({ subject, span, limit }: Window) => {
      const startedBefore = new Date(
        now.getTime() - SPAN_SECONDS[span] * 1000,
      ).toISOString();
      const [row] = await transaction<{ requests: number; started_at: Date }[]>`
        insert into public.assistant_request_windows as current
          (subject, span, started_at, requests)
        values (${subject}, ${span}, ${now.toISOString()}, 1)
        on conflict (subject, span) do update set
          requests = case when current.started_at <= ${startedBefore}
            then 1 else current.requests + 1 end,
          started_at = case when current.started_at <= ${startedBefore}
            then excluded.started_at else current.started_at end
        returning requests, started_at
      `;
      if (!row) throw new Error("The request window was not counted");
      if (row.requests <= limit) return 0;
      const endsAt = row.started_at.getTime() + SPAN_SECONDS[span] * 1000;
      return Math.ceil((endsAt - now.getTime()) / 1000);
    };

    let retryAfter = Math.max(
      await take({
        subject: account,
        span: "minute",
        limit: ACCOUNT_MINUTE_LIMIT,
      }),
      await take({ subject: account, span: "day", limit: ACCOUNT_DAY_LIMIT }),
    );
    if (retryAfter === 0)
      retryAfter = await take({
        subject: `client:${clientId}`,
        span: "minute",
        limit: CLIENT_MINUTE_LIMIT,
      });
    return retryAfter === 0
      ? { allowed: true }
      : { allowed: false, retryAfter };
  });
}
