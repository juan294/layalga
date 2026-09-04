import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import type { Sql } from "postgres";

export interface DemoSnapshot {
  visits: { id: string; status: string }[];
  notifications: {
    recipient_kind: "host" | "party";
    recipient_id: string;
    kind: string;
  }[];
  decisions: { id: string; status: string }[];
}

export interface ReleaseCliOptions {
  baseUrl: string;
  expectedCommit?: string;
  headed: boolean;
  expectedRuntime?: "local" | "agentcore";
  /**
   * Whether email pings are expected to send during the demo. Defaults from
   * `EMAIL=ses` in the local script environment, since `demo:e2e` normally
   * runs against a server sharing that environment; `--expect-email` forces
   * it on for a release probe run against a remote deployment whose
   * environment this process cannot read.
   */
  expectEmail: boolean;
}

export function assertDemoSnapshot(snapshot: DemoSnapshot): void {
  assert.equal(snapshot.visits.length, 2, "expected exactly two visits");
  assert.equal(
    snapshot.visits.filter((visit) => visit.status === "escalated").length,
    1,
    "expected exactly one escalated visit",
  );
  assert.equal(
    snapshot.notifications.length,
    4,
    "expected four total notifications",
  );
  const hostEscalations = snapshot.notifications.filter(
    (notification) =>
      notification.recipient_kind === "host" &&
      notification.kind === "reconfirm_escalation",
  );
  assert.equal(
    hostEscalations.length,
    2,
    "expected exactly two host escalation notifications",
  );
  assert.equal(
    new Set(hostEscalations.map((notification) => notification.recipient_id))
      .size,
    2,
    "expected host escalations for two distinct hosts",
  );
  assert.equal(
    snapshot.decisions.filter((decision) => decision.status === "approved")
      .length,
    1,
    "expected one approved pending decision",
  );
  assert.equal(
    snapshot.decisions.filter((decision) => decision.status === "pending")
      .length,
    0,
    "expected no unanswered pending decision",
  );
}

export function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !/^\/*$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(`Base URL must be a plain HTTP(S) origin: ${value}`);
  }
  return url.origin;
}

export function parseReleaseCliOptions(
  argv: string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReleaseCliOptions {
  let baseUrl = env.APP_URL ?? "http://127.0.0.1:3008";
  let expectedCommit = env.EXPECTED_COMMIT_SHA;
  let headed = false;
  let expectedRuntime: "local" | "agentcore" | undefined;
  let expectEmail = env.EMAIL === "ses";

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--headed") {
      headed = true;
      continue;
    }
    if (argument === "--expect-email") {
      expectEmail = true;
      continue;
    }
    if (argument === "--base" || argument === "--commit") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === "--base") baseUrl = value;
      else expectedCommit = value;
      index += 1;
      continue;
    }
    if (argument === "--expect-runtime") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      if (value !== "local" && value !== "agentcore") {
        throw new Error(`${argument} must be "local" or "agentcore"`);
      }
      expectedRuntime = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    expectedCommit,
    headed,
    expectedRuntime,
    expectEmail,
  };
}

export async function responseJson<T>(
  response: Response,
  operation: string,
): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${operation} failed with HTTP ${response.status}: ${body.slice(0, 500)}`,
    );
  }
  return JSON.parse(body) as T;
}

export function isDirectExecution(metaUrl: string, argv1?: string): boolean {
  return Boolean(argv1 && metaUrl === pathToFileURL(argv1).href);
}

export function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  return message.replace(/[A-Za-z0-9_-]{43}/g, "[redacted]");
}

export function requiredEnvironment(
  name:
    | "DATABASE_URL"
    | "LINK_TOKEN_SECRET"
    | "TICK_SECRET"
    | "AGENTCORE_RUNTIME_ARN",
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export interface TaggedArtifactCounts {
  invitations: number;
  runs: number;
  sessions: number;
}

export interface CleanupTaggedRunArtifactsOptions {
  /**
   * Durable agent session IDs to delete alongside the ones derived from the
   * tagged invitations, e.g. a `capture_<hostId>` session that a host_capture
   * run writes into regardless of which raw message triggered it.
   */
  extraSessionIds?: readonly string[];
}

/** Builds the raw-message suffix used to tag and later find synthetic data. */
export function markerSuffix(marker: string): string {
  return ` [${marker}]`;
}

/**
 * Deletes invitations whose `raw_message` ends with `suffix`, together with
 * the runs, audit events, and durable agent sessions those invitations
 * produced (through their visits' scheduled jobs, through a run payload that
 * carries the same tagged raw message, or through `extraSessionIds`).
 * Verifies zero rows remain for the tag before returning. Shared by scripts
 * that synthesize disposable, marker-tagged demo data and must prove they
 * clean up after themselves.
 */
export async function cleanupTaggedRunArtifacts(
  sql: Sql,
  homeId: string,
  suffix: string,
  options: CleanupTaggedRunArtifactsOptions = {},
): Promise<TaggedArtifactCounts> {
  const extraSessionIds = options.extraSessionIds ?? [];
  const sessionIds = await sql.begin(async (transaction) => {
    const invitations = await transaction<{ id: string }[]>`
      select id
      from public.invitations
      where home_id = ${homeId}
        and right(raw_message, length(${suffix})) = ${suffix}
      for update
    `;
    const invitationIds = invitations.map(({ id }) => id);
    const visits =
      invitationIds.length > 0
        ? await transaction<{ id: string }[]>`
            select id from public.visits
            where invitation_id = any(${transaction.array(invitationIds)}::uuid[])
          `
        : [];
    const visitIds = visits.map(({ id }) => id);
    const jobs =
      visitIds.length > 0
        ? await transaction<{ id: string }[]>`
            select id from public.scheduled_jobs
            where visit_id = any(${transaction.array(visitIds)}::uuid[])
          `
        : [];
    const ids = [
      ...extraSessionIds,
      ...invitationIds.map((id) => `inv_${id}`),
      ...jobs.map(({ id }) => `tick_${id}`),
    ];
    const runs = await transaction<{ id: string }[]>`
      select id
      from public.runs
      where home_id = ${homeId}
        and (
          session_id = any(${transaction.array(ids)}::text[])
          or right(payload->>'rawMessage', length(${suffix})) = ${suffix}
        )
    `;
    const runIds = runs.map(({ id }) => id);

    if (runIds.length > 0) {
      await transaction`
        delete from public.audit_events
        where run_id = any(${transaction.array(runIds)}::uuid[])
      `;
      await transaction`
        delete from public.runs
        where id = any(${transaction.array(runIds)}::uuid[])
      `;
    }
    if (ids.length > 0) {
      await transaction`
        delete from public.agent_sessions
        where session_id = any(${transaction.array(ids)}::text[])
      `;
    }
    if (invitationIds.length > 0) {
      await transaction`
        delete from public.invitations
        where id = any(${transaction.array(invitationIds)}::uuid[])
      `;
    }
    return ids;
  });

  const [remaining] = await sql<TaggedArtifactCounts[]>`
    select
      (
        select count(*)::integer from public.invitations
        where home_id = ${homeId}
          and right(raw_message, length(${suffix})) = ${suffix}
      ) as invitations,
      (
        select count(*)::integer from public.runs
        where home_id = ${homeId}
          and (
            right(payload->>'rawMessage', length(${suffix})) = ${suffix}
            or session_id = any(${sql.array(sessionIds)}::text[])
          )
      ) as runs,
      (
        select count(*)::integer from public.agent_sessions
        where session_id = any(${sql.array(sessionIds)}::text[])
      ) as sessions
  `;
  const counts = remaining ?? { invitations: 0, runs: 0, sessions: 0 };
  if (counts.invitations !== 0 || counts.runs !== 0 || counts.sessions !== 0) {
    throw new Error(
      `Tagged run cleanup was incomplete for suffix "${suffix}": ${JSON.stringify(
        counts,
      )}`,
    );
  }
  return counts;
}
