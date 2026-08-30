import { randomUUID } from "node:crypto";

import { getDatabaseConnection } from "@/core/db/client";

import { DEMO_HOST_COOKIE, readDemoHostSession } from "./demo-session";

type DemoMutationAction = "clock" | "reset";
const GLOBAL_DEMO_SESSION_ID = "00000000-0000-4000-8000-000000000000";

interface DemoMutationOptions {
  limit?: number;
  now?: number;
  resolveHomeId?: (hostId: string) => Promise<string | null>;
  consumeRateLimit?: (
    homeId: string,
    sessionId: string,
    action: DemoMutationAction,
    now: number,
    limit: number,
    windowMs: number,
  ) => Promise<boolean>;
  secret?: string;
  windowMs?: number;
}

type DemoMutationAuthorization =
  | { authorized: true; hostId: string; sessionId: string }
  | {
      authorized: false;
      reason: "origin" | "session" | "scope" | "rate_limit";
    };

export async function authorizeDemoMutation(
  request: Request,
  homeId: string,
  action: DemoMutationAction,
  options: DemoMutationOptions = {},
): Promise<DemoMutationAuthorization> {
  if (!hasTrustedOrigin(request)) {
    return { authorized: false, reason: "origin" };
  }

  const cookie = readCookie(request.headers.get("cookie"), DEMO_HOST_COOKIE);
  const session = readDemoHostSession(cookie, {
    now: options.now,
    secret: options.secret,
  });
  if (!session) return { authorized: false, reason: "session" };

  const resolveHomeId = options.resolveHomeId ?? findDemoHomeId;
  if ((await resolveHomeId(session.hostId)) !== homeId) {
    return { authorized: false, reason: "scope" };
  }

  const now = options.now ?? Date.now();
  const limit = options.limit ?? 10;
  const windowMs = options.windowMs ?? 60_000;
  const consumeRateLimit = options.consumeRateLimit ?? consumeDatabaseRateLimit;
  if (
    !(await consumeRateLimit(
      homeId,
      session.sessionId,
      action,
      now,
      limit,
      windowMs,
    ))
  ) {
    return { authorized: false, reason: "rate_limit" };
  }

  return {
    authorized: true,
    hostId: session.hostId,
    sessionId: session.sessionId,
  };
}

export async function acquireDemoMutationLease(
  homeId: string,
  sessionId: string,
  leaseMs = 5 * 60 * 1_000,
): Promise<(() => Promise<void>) | null> {
  const sql = getDatabaseConnection().sql;
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + leaseMs);
  const [lease] = await sql<{ lease_token: string }[]>`
    insert into public.demo_mutation_leases (
      home_id, session_id, lease_token, expires_at
    ) values (${homeId}, ${sessionId}, ${token}, ${expiresAt.toISOString()})
    on conflict (home_id) do update
    set session_id = excluded.session_id,
      lease_token = excluded.lease_token,
      expires_at = excluded.expires_at
    where public.demo_mutation_leases.expires_at <= now()
    returning lease_token
  `;
  if (!lease) return null;

  return async () => {
    await sql`
      delete from public.demo_mutation_leases
      where home_id = ${homeId} and lease_token = ${token}
    `;
  };
}

async function consumeDatabaseRateLimit(
  homeId: string,
  sessionId: string,
  action: DemoMutationAction,
  now: number,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  return (
    (await consumeRateBucket(
      homeId,
      sessionId,
      action,
      now,
      limit,
      windowMs,
    )) &&
    (await consumeRateBucket(
      homeId,
      GLOBAL_DEMO_SESSION_ID,
      action,
      now,
      limit * 3,
      windowMs,
    ))
  );
}

async function consumeRateBucket(
  homeId: string,
  sessionId: string,
  action: DemoMutationAction,
  now: number,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const sql = getDatabaseConnection().sql;
  const windowStartedAt = new Date(now);
  const staleBefore = new Date(now - windowMs);
  const [row] = await sql<{ request_count: number }[]>`
    insert into public.demo_mutation_limits (
      home_id, session_id, action, window_started_at, request_count
    ) values (${homeId}, ${sessionId}, ${action}, ${windowStartedAt.toISOString()}, 1)
    on conflict (home_id, session_id, action) do update
    set window_started_at = case
          when public.demo_mutation_limits.window_started_at <= ${staleBefore.toISOString()}
            then excluded.window_started_at
          else public.demo_mutation_limits.window_started_at
        end,
        request_count = case
          when public.demo_mutation_limits.window_started_at <= ${staleBefore.toISOString()}
            then 1
          else public.demo_mutation_limits.request_count + 1
        end
    where public.demo_mutation_limits.window_started_at <= ${staleBefore.toISOString()}
      or public.demo_mutation_limits.request_count < ${limit}
    returning request_count
  `;
  return row !== undefined;
}

function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const allowed = new Set<string>([new URL(request.url).origin]);
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      return false;
    }
  }
  return allowed.has(origin);
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const [candidate, ...value] = pair.trim().split("=");
    if (candidate === name) return value.join("=");
  }
  return undefined;
}

async function findDemoHomeId(hostId: string): Promise<string | null> {
  const sql = getDatabaseConnection().sql;
  const [host] = await sql<{ home_id: string }[]>`
    select host.home_id
    from public.hosts as host
    join public.homes as home on home.id = host.home_id
    where host.id = ${hostId} and home.demo = true
  `;
  return host?.home_id ?? null;
}
