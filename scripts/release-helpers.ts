import { pathToFileURL } from "node:url";

import type { Sql } from "postgres";

export type ProbeTarget = "local" | "production";

export interface ReleaseCliOptions {
  baseUrl: string;
  expectedCommit?: string;
  expectedRuntime?: "local" | "agentcore";
  /**
   * Whether returning-guest memory is expected to be active. Defaults from
   * `MEMORY=agentcore` in the script environment; `--expect-memory` forces it
   * on for a probe run against a remote deployment. When set, the
   * host-capture probe also asserts a `search_memory` tool_call audit row.
   */
  expectMemory: boolean;
  /** Which probe set runs: the full local CI set or the production gate. */
  target: ProbeTarget;
  /** Removes the fixture households of an earlier run and exits. */
  cleanupOnly?: string;
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

const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseReleaseCliOptions(
  argv: string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReleaseCliOptions {
  let baseUrl = env.APP_URL ?? "http://127.0.0.1:3008";
  let expectedCommit = env.EXPECTED_COMMIT_SHA;
  let expectedRuntime: "local" | "agentcore" | undefined;
  let expectMemory = env.MEMORY === "agentcore";
  let target: ProbeTarget = "local";
  let cleanupOnly: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--expect-memory") {
      expectMemory = true;
      continue;
    }
    const value = argv[index + 1];
    if (
      argument === "--base" ||
      argument === "--commit" ||
      argument === "--expect-runtime" ||
      argument === "--target" ||
      argument === "--cleanup-only"
    ) {
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
    }
    if (argument === "--base") {
      baseUrl = value!;
    } else if (argument === "--commit") {
      expectedCommit = value;
    } else if (argument === "--expect-runtime") {
      if (value !== "local" && value !== "agentcore") {
        throw new Error(`${argument} must be "local" or "agentcore"`);
      }
      expectedRuntime = value;
    } else if (argument === "--target") {
      if (value !== "local" && value !== "production") {
        throw new Error(`${argument} must be "local" or "production"`);
      }
      target = value;
    } else if (argument === "--cleanup-only") {
      if (!RUN_ID_PATTERN.test(value!)) {
        throw new Error(`${argument} requires a probe run id (UUID)`);
      }
      cleanupOnly = value;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    expectedCommit,
    expectedRuntime,
    expectMemory,
    target,
    cleanupOnly,
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

export { markerSuffix } from "../src/test-support/fixture-household";

/**
 * Invitation ids created by the tagged `host_capture` runs of `homeId`,
 * resolved through the run's enqueue payload (which carries the tag
 * verbatim) and the `capture_invitation` tool_call audit row. Never keyed on
 * `invitations.raw_message`: that column stores the message as the model
 * restated it in its tool call, and a model may drop the bracketed tag.
 */
export async function taggedInvitationIds(
  sql: Sql,
  homeId: string,
  suffix: string,
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select distinct invitation.id
    from public.runs run
    join public.audit_events audit
      on audit.run_id = run.id
     and audit.home_id = run.home_id
     and audit.kind = 'tool_call'
     and audit.payload->>'name' = 'capture_invitation'
    join public.invitations invitation
      on invitation.id::text = audit.payload->>'invitationId'
     and invitation.home_id = run.home_id
    where run.home_id = ${homeId}
      and run.task = 'host_capture'
      and right(run.payload->>'rawMessage', length(${suffix})) = ${suffix}
  `;
  return rows.map(({ id }) => id);
}

/**
 * Deletes the invitations the tagged `host_capture` runs created (see
 * `taggedInvitationIds`), together with the runs, audit events, and durable
 * agent sessions those invitations produced (through their visits' scheduled
 * jobs, through a run payload that carries the same tagged raw message, or
 * through `extraSessionIds`).
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
  const invitationIds = await taggedInvitationIds(sql, homeId, suffix);
  const sessionIds = await sql.begin(async (transaction) => {
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
        where id = any(${sql.array(invitationIds)}::uuid[])
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
