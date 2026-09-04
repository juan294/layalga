import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { z } from "zod";

import { MIN_INTERNAL_SECRET_BYTES } from "../src/app/api/agent/internal-auth";
import { hashLinkToken } from "../src/core/booking/invitations";
import { parseStoredRunResult } from "../src/agent/task";
import { DEMO_SEED, seedDemo } from "./seed-demo";
import { runDemoE2E } from "./demo-e2e";
import {
  cleanupTaggedRunArtifacts,
  isDirectExecution,
  markerSuffix,
  parseReleaseCliOptions,
  requiredEnvironment,
  responseJson,
  safeErrorMessage,
  type ReleaseCliOptions,
} from "./release-helpers";

interface ProbeEvidence {
  probe: number;
  name: string;
  status: "passed";
  detail: string;
}

interface ProbeFixture {
  homeId: string;
  homeName: string;
  invitationIds: readonly [string, string];
}

const runResultSchema = z.object({
  runId: z.uuid(),
  status: z.enum(["queued", "completed", "interrupted", "failed"]),
  sessionId: z.string(),
  pendingDecisionIds: z.array(z.uuid()),
  summary: z.string(),
});
const storedRunSchema = z.object({
  id: z.uuid(),
  status: z.enum(["queued", "running", "completed", "interrupted", "failed"]),
  result: z.unknown().nullable(),
});
const roomCoordinationProofSchema = z.object({
  proposalCreated: z.literal(true),
  privateBlockApplied: z.literal(true),
  blockedRoomHidden: z.literal(true),
  withheldRoomOpened: z.literal(true),
  selectedRoomIds: z.tuple([z.uuid(), z.uuid()]),
  overflowInterrupted: z.literal(true),
  overflowApproved: z.literal(true),
  overflowAppliedOnce: z.literal(true),
  calendarFeedRead: z.literal(true),
  calendarPrivateDataAbsent: z.literal(true),
  calendarEventCount: z.int(),
});

type StoredRun = z.infer<typeof storedRunSchema>;
type TerminalStoredRun = StoredRun & {
  status: "completed" | "interrupted" | "failed";
};

interface TerminalProbeRunResult {
  runId: string;
  status: "completed" | "interrupted" | "failed";
  summary: string;
  executedOn?: "local" | "agentcore";
}

export async function runReleaseProbes(
  options: ReleaseCliOptions,
): Promise<ProbeEvidence[]> {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const linkTokenSecret = requiredEnvironment("LINK_TOKEN_SECRET");
  const agentRouteSecret = requiredAgentRouteSecret();
  const tickSecret = requiredInternalSecret("TICK_SECRET");
  const sql = postgres(databaseUrl, { prepare: false, max: 8 });
  const runId = randomUUID();
  const runMarker = `release-probe:${runId}`;
  const evidence: ProbeEvidence[] = [];
  let fixture: ProbeFixture | undefined;

  try {
    await probeHealth(options);
    evidence.push(pass(1, "health and identity", "health status is ok"));

    const demo = await runDemoE2E({ ...options, runMarker });

    const [captured] = await sql<{ count: number }[]>`
      select count(*)::integer as count
      from public.invitations
      where home_id = ${DEMO_SEED.home.id}
        and (
          raw_message = ${demo.rawMessages[0]}
          or raw_message = ${demo.rawMessages[1]}
        )
        and status = 'tentative'
    `;
    assert.equal(
      captured?.count,
      2,
      "host capture must create one tagged tentative invitation per host",
    );
    await assertCaptureRunsExecutedOn(
      sql,
      options.expectedRuntime,
      demo.rawMessages,
    );
    evidence.push(
      pass(
        2,
        "host capture",
        options.expectedRuntime
          ? `two tagged tentative invitations created; host capture executed on ${options.expectedRuntime}`
          : "two tagged tentative invitations created",
      ),
    );

    await probeGuestConfirmation(sql, demo.rawMessages[0]);
    evidence.push(
      pass(3, "guest confirmation", "hold and confirmation each executed once"),
    );

    fixture = await createProbeFixture(sql, runId);
    await probeConcurrentConflict(
      sql,
      options.baseUrl,
      agentRouteSecret,
      tickSecret,
      fixture,
    );
    evidence.push(
      pass(4, "concurrent conflict", "one hold won and one was rejected"),
    );

    await probeInterruptResume(sql, demo.rawMessages[1]);
    await assertResumeRunExecutedOn(
      sql,
      options.expectedRuntime,
      DEMO_SEED.home.id,
    );
    evidence.push(
      pass(
        5,
        "interrupt and resume",
        options.expectedRuntime
          ? `one decision approved and applied once; resume run executed on ${options.expectedRuntime}`
          : "one decision approved and applied once",
      ),
    );

    assert.equal(demo.visits, 2);
    assert.equal(demo.escalatedVisits, 1);
    assert.equal(demo.notifications, 4);
    assert.equal(demo.hostEscalations, 2);
    if (options.expectEmail) {
      assert.equal(demo.emailPings.pendingDecisionSent, 2);
      assert.equal(demo.emailPings.escalationSent, 2);
    }
    evidence.push(
      pass(
        6,
        "clock reconfirmation",
        options.expectEmail
          ? "four total notifications include exactly two host escalations; two hosts each received a decision and an escalation email"
          : "four total notifications include exactly two host escalations",
      ),
    );

    assertRoomCoordinationProof(demo.roomCoordination);
    evidence.push(
      pass(
        7,
        "room coordination",
        "proposal, exact rooms, overflow approval, and private calendar proved",
      ),
    );

    await probeUnauthorizedGuest(options.baseUrl);
    evidence.push(
      pass(8, "guest isolation", "invalid token revealed no family identity"),
    );
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      await cleanupDemoArtifacts(sql, runMarker, linkTokenSecret);
      await seedDemo(databaseUrl, linkTokenSecret);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (fixture) {
      try {
        await cleanupProbeFixture(sql, fixture);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    await sql.end({ timeout: 5 });
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "Synthetic cleanup failed");
    }
    if (fixture) {
      evidence.push(
        pass(
          9,
          "synthetic cleanup",
          `deleted probe rows tagged ${runId} and restored the demo fixture`,
        ),
      );
    }
  }

  assert.equal(evidence.length, 9, "all nine release probes must pass");
  return evidence;
}

export function assertRoomCoordinationProof(value: unknown): void {
  const proof = roomCoordinationProofSchema.parse(value);
  assert.deepEqual(
    proof.selectedRoomIds,
    [DEMO_SEED.rooms[0].id, DEMO_SEED.rooms[1].id],
    "selected room IDs must match the exact synthetic multi-room choice",
  );
  assert.ok(
    proof.calendarEventCount > 0,
    "room coordination must produce at least one calendar event",
  );
}

async function probeHealth(options: ReleaseCliOptions): Promise<void> {
  const health = await responseJson<{ status: string; commit?: string }>(
    await fetch(`${options.baseUrl}/api/health`),
    "health probe",
  );
  assert.equal(health.status, "ok");

  const hostname = new URL(options.baseUrl).hostname;
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  if (!local && !options.expectedCommit) {
    throw new Error("--commit is required for a non-local release probe");
  }
  if (options.expectedCommit) {
    assert.equal(
      health.commit,
      options.expectedCommit,
      "deployed commit does not match the release candidate",
    );
  }
}

/**
 * Asserts every row's stored run result executed on `expectedRuntime`, doing
 * nothing when no runtime is asserted. `describe` renders the failure
 * message for a given row label.
 */
function assertExecutedOn(
  rows: readonly { label: string; result: unknown }[],
  expectedRuntime: "local" | "agentcore" | undefined,
  describe: (label: string, expectedRuntime: "local" | "agentcore") => string,
): void {
  if (!expectedRuntime) return;
  for (const row of rows) {
    const result = parseStoredRunResult(row.result);
    assert.equal(
      result.executedOn,
      expectedRuntime,
      describe(row.label, expectedRuntime),
    );
  }
}

async function assertCaptureRunsExecutedOn(
  sql: Sql,
  expectedRuntime: "local" | "agentcore" | undefined,
  rawMessages: readonly [string, string],
): Promise<void> {
  if (!expectedRuntime) return;
  const rows = await sql<{ raw_message: string; result: unknown }[]>`
    select payload->>'rawMessage' as raw_message, result
    from public.runs
    where home_id = ${DEMO_SEED.home.id}
      and task = 'host_capture'
      and payload->>'rawMessage' = any(${sql.array([...rawMessages])})
  `;
  assert.equal(
    rows.length,
    2,
    "expected one host_capture run per tagged invitation",
  );
  assertExecutedOn(
    rows.map((row) => ({ label: row.raw_message, result: row.result })),
    expectedRuntime,
    (label, runtime) =>
      `host capture run for "${label}" must execute on ${runtime}`,
  );
}

async function assertResumeRunExecutedOn(
  sql: Sql,
  expectedRuntime: "local" | "agentcore" | undefined,
  homeId: string,
): Promise<void> {
  if (!expectedRuntime) return;
  const [row] = await sql<{ result: unknown }[]>`
    select run.result
    from public.runs run
    join public.pending_decisions decision on decision.applied_run_id = run.id
    where decision.home_id = ${homeId} and decision.status = 'approved'
  `;
  assert.ok(row, "resume run not found for the approved pending decision");
  assertExecutedOn(
    [{ label: "resume", result: row.result }],
    expectedRuntime,
    (_label, runtime) => `resume run must execute on ${runtime}`,
  );
}

async function probeGuestConfirmation(
  sql: Sql,
  rawMessage: string,
): Promise<void> {
  const [visit] = await sql<{ id: string }[]>`
    select visit.id
    from public.visits as visit
    join public.invitations as invitation on invitation.id = visit.invitation_id
    where invitation.home_id = ${DEMO_SEED.home.id}
      and invitation.raw_message = ${rawMessage}
  `;
  assert.ok(visit, "tagged guest visit was not created");
  const [audit] = await sql<{ holds: number; confirmations: number }[]>`
    select
      count(*) filter (
        where payload->>'name' = 'create_temporary_hold'
      )::integer as holds,
      count(*) filter (
        where payload->>'name' = 'confirm_visit'
      )::integer as confirmations
    from public.audit_events
    where home_id = ${DEMO_SEED.home.id}
      and payload->>'visitId' = ${visit.id}
  `;
  assert.deepEqual(audit, { holds: 1, confirmations: 1 });
}

async function createProbeFixture(
  sql: Sql,
  runId: string,
): Promise<ProbeFixture> {
  const homeName = `Release probe ${runId}`;
  return sql.begin(async (transaction) => {
    const [home] = await transaction<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${homeName}, 'Europe/Madrid')
      returning id
    `;
    assert.ok(home);
    await transaction`
      insert into public.rooms (
        home_id, name, beds, guest_label, floor_label,
        sleeping_arrangement, maximum_capacity, inventory_state
      ) values (
        ${home.id}, ${`Only room ${runId}`}, 2,
        'Probe room', 'Probe floor', 'One double bed', 2, 'available'
      )
    `;
    const [host] = await transaction<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home.id}, ${`Probe host ${runId}`}, 'en')
      returning id
    `;
    assert.ok(host);

    const invitationIds: string[] = [];
    for (const number of [1, 2]) {
      const [party] = await transaction<{ id: string }[]>`
        insert into public.parties (home_id, family_name, locale, link_token)
        values (
          ${home.id},
          ${`Probe party ${number} ${runId}`},
          'en',
          ${`release-probe-${runId}-${number}`}
        )
        returning id
      `;
      assert.ok(party);
      const [invitation] = await transaction<{ id: string }[]>`
        insert into public.invitations (
          home_id, host_id, party_id, raw_message
        ) values (
          ${home.id}, ${host.id}, ${party.id}, ${`release-probe:${runId}`}
        )
        returning id
      `;
      assert.ok(invitation);
      invitationIds.push(invitation.id);
    }

    return {
      homeId: home.id,
      homeName,
      invitationIds: invitationIds as [string, string],
    };
  });
}

async function probeConcurrentConflict(
  sql: Sql,
  baseUrl: string,
  agentRouteSecret: string,
  tickSecret: string,
  fixture: ProbeFixture,
): Promise<void> {
  const responses = await Promise.all(
    fixture.invitationIds.map((invitationId) =>
      fetch(`${baseUrl}/api/agent/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-layalga-internal": agentRouteSecret,
        },
        body: JSON.stringify({
          task: "guest_submit",
          homeId: fixture.homeId,
          invitationId,
          stay: ["2026-10-02", "2026-10-04"],
          adults: 2,
          children: 0,
          pets: 0,
          locale: "en",
        }),
      }),
    ),
  );
  assert.equal(
    responses.filter((response) => response.ok).length,
    2,
    "the internal agent route must acknowledge both runs",
  );
  const acknowledgements = await Promise.all(
    responses.map((response, index) =>
      responseJson<unknown>(response, `concurrent agent run ${index + 1}`),
    ),
  );
  const runIds = queuedRunIds(acknowledgements);
  const results = await drainAndCollectTerminalRunResults(
    runIds,
    async () => {
      await responseJson(
        await fetch(`${baseUrl}/api/ticks`, {
          headers: { "x-layalga-internal": tickSecret },
        }),
        "queued probe drain",
      );
    },
    (exactRunIds) => sql`
      select id, status, result
      from public.runs
      where id = any(${sql.array([...exactRunIds])}::uuid[])
    `,
  );
  assert.equal(
    results.filter((result) => /confirmed/i.test(result.summary)).length,
    1,
    "exactly one concurrent run must report confirmation",
  );
  assert.equal(
    results.filter((result) =>
      /free beds|room allocation/i.test(result.summary),
    ).length,
    1,
    "exactly one concurrent run must report that the room is unavailable",
  );
  const [outcome] = await sql<
    {
      confirmed: number;
      holds: number;
      confirmations: number;
    }[]
  >`
    select
      (
        select count(*)::integer
        from public.visits
        where home_id = ${fixture.homeId} and status = 'confirmed'
      ) as confirmed,
      count(*) filter (
        where kind = 'tool_call'
          and payload->>'name' = 'create_temporary_hold'
      )::integer as holds,
      count(*) filter (
        where kind = 'tool_call' and payload->>'name' = 'confirm_visit'
      )::integer as confirmations
    from public.audit_events
    where home_id = ${fixture.homeId}
  `;
  assert.deepEqual(
    outcome,
    { confirmed: 1, holds: 1, confirmations: 1 },
    "exactly one conflicting visit must pass the policy and confirm",
  );
}

export function queuedRunIds(results: readonly unknown[]): string[] {
  const acknowledgements = results.map((result) =>
    runResultSchema.parse(result),
  );
  assert.ok(
    acknowledgements.every((result) => result.status === "queued"),
    "concurrent agent runs must return a queued acknowledgement",
  );
  const runIds = acknowledgements.map((result) => result.runId);
  assert.equal(
    new Set(runIds).size,
    runIds.length,
    "queued acknowledgements must contain distinct run IDs",
  );
  return runIds;
}

export async function drainAndCollectTerminalRunResults(
  runIds: readonly string[],
  drain: () => Promise<void>,
  load: (runIds: readonly string[]) => Promise<readonly unknown[]>,
  options: { timeoutMs?: number; pollMs?: number; redrainMs?: number } = {},
): Promise<TerminalProbeRunResult[]> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const pollMs = options.pollMs ?? 250;
  const redrainMs = options.redrainMs ?? 15_000;
  assert.ok(timeoutMs > 0, "terminal run polling needs a positive timeout");

  const deadline = Date.now() + timeoutMs;
  await drain();
  let lastDrainAt = Date.now();

  for (;;) {
    const rows = (await load(runIds)).map((row) => storedRunSchema.parse(row));
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const exactRows = runIds.map((runId) => rowsById.get(runId));
    if (exactRows.every(isTerminalStoredRun)) {
      return exactRows.map((row, index) => {
        const result = parseStoredRunResult(row.result);
        const runId = runIds[index];
        assert.ok(runId, "terminal run result ID is missing");
        assert.ok(
          result.summary !== undefined,
          `terminal run ${runId} is missing a summary`,
        );
        return {
          runId,
          status: row.status,
          summary: result.summary,
          executedOn: result.executedOn,
        };
      });
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `queued probe runs did not reach terminal status: ${runIds.join(", ")}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));

    if (Date.now() - lastDrainAt >= redrainMs) {
      await drain();
      lastDrainAt = Date.now();
    }
  }
}

function isTerminalStoredRun(
  row: StoredRun | undefined,
): row is TerminalStoredRun {
  return Boolean(
    row &&
    row.status !== "queued" &&
    row.status !== "running" &&
    row.result !== null,
  );
}

async function probeInterruptResume(
  sql: Sql,
  rawMessage: string,
): Promise<void> {
  const [decision] = await sql<{ approved: number; pending: number }[]>`
    select
      count(*) filter (where status = 'approved')::integer as approved,
      count(*) filter (where status = 'pending')::integer as pending
    from public.pending_decisions
    where home_id = ${DEMO_SEED.home.id}
  `;
  assert.deepEqual(decision, { approved: 1, pending: 0 });
  const [applied] = await sql<{ count: number }[]>`
    select count(*)::integer as count
    from public.audit_events
    where home_id = ${DEMO_SEED.home.id}
      and kind = 'decision_applied'
  `;
  assert.equal(applied?.count, 1);
  const [toolExecution] = await sql<{ count: number }[]>`
    select count(*)::integer as count
    from public.audit_events event
    join public.visits visit
      on event.payload->>'visitId' = visit.id::text
    join public.invitations invitation
      on invitation.id = visit.invitation_id
    where invitation.raw_message = ${rawMessage}
      and event.kind = 'tool_call'
      and event.payload->>'name' = 'create_temporary_hold'
  `;
  assert.equal(
    toolExecution?.count,
    1,
    "the interrupted booking tool must execute exactly once",
  );
}

async function probeUnauthorizedGuest(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/en/g/${"x".repeat(43)}`);
  assert.ok(response.ok, `invalid guest page returned HTTP ${response.status}`);
  const html = await response.text();
  assert.match(html, /data-status="invalid"/);
  assert.doesNotMatch(html, /Familia Vega|The Oteros/);
}

async function cleanupProbeFixture(
  sql: Sql,
  fixture: ProbeFixture,
): Promise<void> {
  const sessionIds = fixture.invitationIds.map((id) => `inv_${id}`);
  await sql`
    delete from public.agent_sessions
    where session_id = any(${sql.array(sessionIds)}::text[])
  `;
  await sql`
    delete from public.homes
    where id = ${fixture.homeId} and name = ${fixture.homeName}
  `;
  const [remaining] = await sql<{ homes: number; sessions: number }[]>`
    select
      (
        select count(*)::integer from public.homes
        where id = ${fixture.homeId} or name = ${fixture.homeName}
      ) as homes,
      (
        select count(*)::integer from public.agent_sessions
        where session_id = any(${sql.array(sessionIds)}::text[])
      ) as sessions
  `;
  assert.deepEqual(
    remaining,
    { homes: 0, sessions: 0 },
    "probe home cleanup was incomplete",
  );
}

async function cleanupDemoArtifacts(
  sql: Sql,
  runMarker: string,
  linkTokenSecret: string,
): Promise<void> {
  await cleanupTaggedRunArtifacts(
    sql,
    DEMO_SEED.home.id,
    markerSuffix(runMarker),
    {
      extraSessionIds: DEMO_SEED.hosts.map((host) => `capture_${host.id}`),
    },
  );

  for (const party of DEMO_SEED.parties) {
    const token = party.guestLink.split("/").at(-1);
    assert.ok(token, `seed token missing for ${party.familyName}`);
    await sql`
      update public.parties
      set locale = ${party.locale},
        link_token = ${hashLinkToken(token, linkTokenSecret)},
        link_token_expires_at = ${party.linkTokenExpiresAt}
      where id = ${party.id} and home_id = ${DEMO_SEED.home.id}
    `;
  }
}

function pass(probe: number, name: string, detail: string): ProbeEvidence {
  return { probe, name, status: "passed", detail };
}

function requiredAgentRouteSecret(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return requiredInternalSecret("AGENT_ROUTE_SECRET", env);
}

function requiredInternalSecret(
  name: "AGENT_ROUTE_SECRET" | "TICK_SECRET",
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const secret = env[name];
  if (!secret) throw new Error(`${name} is required`);
  if (Buffer.byteLength(secret) < MIN_INTERNAL_SECRET_BYTES) {
    throw new Error(
      `${name} must be at least ${MIN_INTERNAL_SECRET_BYTES} bytes`,
    );
  }
  return secret;
}

async function main(): Promise<void> {
  const evidence = await runReleaseProbes(
    parseReleaseCliOptions(process.argv.slice(2)),
  );
  console.log(JSON.stringify({ status: "passed", evidence }, null, 2));
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
