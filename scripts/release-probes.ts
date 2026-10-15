import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { z } from "zod";

import { MIN_INTERNAL_SECRET_BYTES } from "../src/app/api/agent/internal-auth";
import { parseStoredRunResult, type AgentTask } from "../src/agent/task";
import { recordHostDecision } from "../src/core/decisions/host-decision";
import {
  createFixtureHousehold,
  fixtureParties,
  fixtureStay,
  removeFixtureHousehold,
  type FixtureHousehold,
} from "../src/test-support/fixture-household";
import {
  isDirectExecution,
  parseReleaseCliOptions,
  requiredEnvironment,
  responseJson,
  safeErrorMessage,
  taggedInvitationIds,
  type ProbeTarget,
  type ReleaseCliOptions,
} from "./release-helpers";

export type ProbeName =
  | "health"
  | "host-capture"
  | "guest-confirmation"
  | "concurrent-conflict"
  | "interrupt-resume"
  | "reconfirmation"
  | "room-coordination"
  | "guest-isolation"
  | "cleanup";

/**
 * The probes each target runs, in order. Production keeps the journeys that
 * only that environment can prove (AgentCore, Bedrock and the production
 * database roles); the rest stay in local CI.
 */
export const PROBES: Record<ProbeTarget, readonly ProbeName[]> = {
  local: [
    "health",
    "host-capture",
    "guest-confirmation",
    "concurrent-conflict",
    "interrupt-resume",
    "reconfirmation",
    "room-coordination",
    "guest-isolation",
    "cleanup",
  ],
  production: [
    "health",
    "host-capture",
    "guest-confirmation",
    "concurrent-conflict",
    "guest-isolation",
    "cleanup",
  ],
};

export interface ProbeEvidence {
  probe: ProbeName;
  status: "passed";
  detail: string;
}

/**
 * `PAUSED`: the environment failed (unreachable base, run timeout); re-run
 * the same candidate. `BLOCKED`: an assertion failed on a completed run; the
 * candidate needs a fix.
 */
export interface ProbeReport {
  status: "passed" | "PAUSED" | "BLOCKED";
  target: ProbeTarget;
  runId: string;
  evidence: ProbeEvidence[];
  failure?: { probe: ProbeName; message: string };
  cleanupCommand?: string;
}

/** An environment failure that does not indict the candidate. */
export class ProbePausedError extends Error {
  override name = "ProbePausedError";
}

export interface ProbeContext {
  sql: Sql;
  options: ReleaseCliOptions;
  runId: string;
  household: FixtureHousehold;
  conflict: FixtureHousehold;
  agentRouteSecret: string;
  tickSecret: string;
  now: Date;
  capturedInvitationId?: string;
}

export type ProbeFn = (context: ProbeContext) => Promise<string>;

export function probeHomeLabels(runId: string): [string, string] {
  return [`Release probe ${runId}`, `Release probe conflict ${runId}`];
}

export function cleanupCommand(runId: string): string {
  return `pnpm run release:probes -- --cleanup-only ${runId}`;
}

export function classifyProbeFailure(error: unknown): "PAUSED" | "BLOCKED" {
  if (error instanceof ProbePausedError) return "PAUSED";
  // fetch() rejects with a TypeError when the base cannot be reached.
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
    return "PAUSED";
  }
  return "BLOCKED";
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

const PROBE_FNS: Record<Exclude<ProbeName, "cleanup">, ProbeFn> = {
  health: probeHealth,
  "host-capture": probeHostCapture,
  "guest-confirmation": probeGuestConfirmation,
  "concurrent-conflict": probeConcurrentConflict,
  "interrupt-resume": probeInterruptResume,
  reconfirmation: probeReconfirmation,
  "room-coordination": probeRoomCoordination,
  "guest-isolation": probeGuestIsolation,
};

export async function runReleaseProbes(
  options: ReleaseCliOptions,
  overrides: Partial<Record<ProbeName, ProbeFn>> = {},
): Promise<ProbeReport> {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const tokenSecret = requiredEnvironment("LINK_TOKEN_SECRET");
  const agentRouteSecret = requiredInternalSecret("AGENT_ROUTE_SECRET");
  const tickSecret = requiredInternalSecret("TICK_SECRET");
  const sql = postgres(databaseUrl, { prepare: false, max: 8 });
  const runId = randomUUID();
  const now = new Date();
  const [label, conflictLabel] = probeHomeLabels(runId);
  const report: ProbeReport = {
    status: "passed",
    target: options.target,
    runId,
    evidence: [],
  };
  let current: ProbeName = "health";

  try {
    const household = await createFixtureHousehold(sql, {
      label,
      tokenSecret,
      hosts: 2,
      now,
      parties: [
        ...fixtureParties(now),
        { familyName: "Reconfirmation family", locale: "en" },
      ],
    });
    const conflict = await createFixtureHousehold(sql, {
      label: conflictLabel,
      tokenSecret,
      now,
      rooms: [
        {
          name: "Only room",
          beds: 2,
          guestLabel: "Probe room",
          floorLabel: "Probe floor",
          sleepingArrangement: "One double bed",
          overflowArrangement: null,
          maximumCapacity: 2,
          inventoryState: "available",
          overflowPolicy: "none",
        },
      ],
      parties: [
        { familyName: "Probe party 1" },
        { familyName: "Probe party 2" },
      ],
    });
    const context: ProbeContext = {
      sql,
      options,
      runId,
      household,
      conflict,
      agentRouteSecret,
      tickSecret,
      now,
    };
    for (const probe of PROBES[options.target]) {
      if (probe === "cleanup") continue;
      current = probe;
      const detail = await (overrides[probe] ?? PROBE_FNS[probe])(context);
      report.evidence.push({ probe, status: "passed", detail });
    }
  } catch (error) {
    report.status = classifyProbeFailure(error);
    report.failure = { probe: current, message: safeErrorMessage(error) };
  } finally {
    try {
      await removeProbeHouseholds(sql, runId);
      if (report.status === "passed") {
        report.evidence.push({
          probe: "cleanup",
          status: "passed",
          detail: `removed the fixture households tagged ${runId}`,
        });
      }
    } catch (error) {
      if (report.status === "passed") report.status = "BLOCKED";
      report.failure ??= { probe: "cleanup", message: safeErrorMessage(error) };
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  if (report.status !== "passed") {
    report.cleanupCommand = cleanupCommand(runId);
  } else {
    assert.deepEqual(
      report.evidence.map(({ probe }) => probe),
      PROBES[options.target],
      `every ${options.target} probe must pass`,
    );
  }
  return report;
}

/** Deletes both fixture households of a probe run and proves none remain. */
export async function removeProbeHouseholds(
  sql: Sql,
  runId: string,
): Promise<number> {
  const [label, conflictLabel] = probeHomeLabels(runId);
  const homes = await sql<{ id: string; name: string }[]>`
    select id, name from public.homes where name in (${label}, ${conflictLabel})
  `;
  for (const home of homes) {
    await removeFixtureHousehold(sql, home.id, home.name);
  }
  const [remaining] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.homes
    where name in (${label}, ${conflictLabel})
  `;
  assert.equal(remaining?.count, 0, "probe household cleanup was incomplete");
  return homes.length;
}

async function probeHealth({ options }: ProbeContext): Promise<string> {
  let health: { status: string; commit?: string };
  try {
    health = await responseJson(
      await fetch(`${options.baseUrl}/api/health`),
      "health probe",
    );
  } catch (error) {
    throw new ProbePausedError(
      `health is unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (health.status !== "ok") {
    throw new ProbePausedError(`health status is ${health.status}`);
  }
  const hostname = new URL(options.baseUrl).hostname;
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  if (!local && !options.expectedCommit) {
    throw new Error("--commit is required for a non-local release probe");
  }
  if (options.expectedCommit && health.commit !== options.expectedCommit) {
    throw new ProbePausedError(
      `deployed commit ${health.commit ?? "unknown"} does not match the release candidate`,
    );
  }
  return "health status is ok";
}

async function probeHostCapture(context: ProbeContext): Promise<string> {
  const { sql, household, options } = context;
  const rawMessage = `Oye, los Vega quieren venir a la casa un finde, son Marta y Xuan con los dos crios.${household.tag}`;
  const [result] = await runToTerminal(context, [
    {
      task: "host_capture",
      homeId: household.homeId,
      hostId: household.hostIds[0]!,
      rawMessage,
      locale: "es",
    },
  ]);
  assert.equal(result?.status, "completed", "host capture must complete");
  assertExecutedOn(result, options.expectedRuntime, "host capture");
  const invitationIds = await taggedInvitationIds(
    sql,
    household.homeId,
    household.tag,
  );
  assert.equal(
    invitationIds.length,
    1,
    "host capture must create one invitation",
  );
  const [captured] = await sql<{ id: string }[]>`
    select id from public.invitations
    where id = any(${sql.array(invitationIds)}::uuid[]) and status = 'tentative'
  `;
  assert.ok(captured, "the captured invitation must be tentative");
  context.capturedInvitationId = captured.id;
  if (options.expectMemory) {
    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.audit_events
      where run_id = ${result.runId}
        and kind = 'tool_call' and payload->>'name' = 'search_memory'
    `;
    assert.ok(
      (row?.count ?? 0) > 0,
      "the matched Vega capture run must call search_memory",
    );
  }
  return [
    "one tagged tentative invitation created",
    options.expectedRuntime ? `executed on ${options.expectedRuntime}` : null,
    options.expectMemory ? "the capture run searched memory" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

async function probeGuestConfirmation(context: ProbeContext): Promise<string> {
  const { sql, household } = context;
  const invitationId = context.capturedInvitationId;
  assert.ok(invitationId, "guest confirmation needs the captured invitation");
  const [result] = await runToTerminal(context, [
    {
      task: "guest_submit",
      homeId: household.homeId,
      invitationId,
      stay: fixtureStay(context.now, 14, 2),
      adults: 2,
      children: 0,
      pets: 0,
      locale: "en",
    },
  ]);
  assert.equal(result?.status, "completed", "guest submission must complete");
  const [visit] = await sql<{ id: string; status: string }[]>`
    select id, status from public.visits where invitation_id = ${invitationId}
  `;
  assert.ok(visit, "the guest submission must create a visit");
  assert.equal(visit.status, "confirmed", "the guest visit must be confirmed");
  const [audit] = await sql<{ holds: number; confirmations: number }[]>`
    select
      count(*) filter (
        where payload->>'name' = 'create_temporary_hold'
      )::integer as holds,
      count(*) filter (
        where payload->>'name' = 'confirm_visit'
      )::integer as confirmations
    from public.audit_events
    where home_id = ${household.homeId} and kind = 'tool_call'
      and payload->>'visitId' = ${visit.id}
  `;
  assert.deepEqual(audit, { holds: 1, confirmations: 1 });
  return "hold and confirmation each executed once";
}

async function probeConcurrentConflict(context: ProbeContext): Promise<string> {
  const { sql, conflict } = context;
  const stay = fixtureStay(context.now, 0, 2);
  const results = await runToTerminal(
    context,
    conflict.parties.map(({ invitationId }) => ({
      task: "guest_submit" as const,
      homeId: conflict.homeId,
      invitationId,
      stay,
      adults: 2,
      children: 0,
      pets: 0,
      locale: "en" as const,
    })),
  );
  assertConcurrentRunsCompleted(results);
  const [outcome] = await sql<
    { confirmed: number; holds: number; confirmations: number }[]
  >`
    select
      (
        select count(*)::integer from public.visits
        where home_id = ${conflict.homeId} and status = 'confirmed'
      ) as confirmed,
      count(*) filter (
        where kind = 'tool_call' and payload->>'name' = 'create_temporary_hold'
      )::integer as holds,
      count(*) filter (
        where kind = 'tool_call' and payload->>'name' = 'confirm_visit'
      )::integer as confirmations
    from public.audit_events
    where home_id = ${conflict.homeId}
  `;
  assert.deepEqual(
    outcome,
    { confirmed: 1, holds: 1, confirmations: 1 },
    "exactly one conflicting visit must pass the policy and confirm",
  );
  return "one hold won and one was rejected";
}

async function probeInterruptResume(context: ProbeContext): Promise<string> {
  const { sql, household, options } = context;
  const parkers = fixtureGuest(household, "The Parkers");
  const [interrupted] = await runToTerminal(context, [
    {
      task: "guest_submit",
      homeId: household.homeId,
      invitationId: parkers.invitationId,
      stay: parkers.preferredStay,
      adults: 2,
      children: 0,
      pets: 1,
      requests: "Ground-floor access for a wheelchair user",
      locale: "en",
    },
  ]);
  assert.equal(
    interrupted?.status,
    "interrupted",
    "a special request must wait for a host",
  );
  const [decision] = await sql<{ id: string }[]>`
    select id from public.pending_decisions
    where home_id = ${household.homeId} and status = 'pending'
  `;
  assert.ok(decision, "the interrupted run must leave one pending decision");
  const hostId = household.hostIds[0]!;
  const recorded = await recordHostDecision(sql, {
    decisionId: decision.id,
    homeId: household.homeId,
    hostId,
    approved: true,
  });
  assert.ok(recorded, "the pending decision must accept the approval");
  const [resumed] = await runToTerminal(context, [
    {
      task: "resume",
      homeId: household.homeId,
      sessionId: recorded.agentSessionId,
      locale: "en",
      responses: [
        {
          interruptId: recorded.interruptId,
          response: { approved: true, hostId },
        },
      ],
    },
  ]);
  assert.equal(resumed?.status, "completed", "the resumed run must complete");
  assertExecutedOn(resumed, options.expectedRuntime, "resume");
  const [state] = await sql<
    { approved: number; pending: number; applied: number; holds: number }[]
  >`
    select
      (
        select count(*)::int from public.pending_decisions
        where home_id = ${household.homeId} and status = 'approved'
      ) as approved,
      (
        select count(*)::int from public.pending_decisions
        where home_id = ${household.homeId} and status = 'pending'
      ) as pending,
      (
        select count(*)::int from public.audit_events
        where home_id = ${household.homeId} and kind = 'decision_applied'
      ) as applied,
      (
        select count(*)::int
        from public.audit_events event
        join public.visits visit on event.payload->>'visitId' = visit.id::text
        where visit.invitation_id = ${parkers.invitationId}
          and event.kind = 'tool_call'
          and event.payload->>'name' = 'create_temporary_hold'
      ) as holds
  `;
  assert.deepEqual(
    state,
    { approved: 1, pending: 0, applied: 1, holds: 1 },
    "one decision must be approved and its booking tool applied once",
  );
  return "one decision approved and applied once";
}

async function probeReconfirmation(context: ProbeContext): Promise<string> {
  const { sql, household } = context;
  const guest = fixtureGuest(household, "Reconfirmation family");
  const [visit] = await sql<{ id: string }[]>`
    insert into public.visits (
      home_id, party_id, invitation_id, stay, adults, children, pets,
      status, confirmed_at
    ) values (
      ${household.homeId}, ${guest.partyId}, ${guest.invitationId},
      daterange(current_date + 2, current_date + 4, '[)'), 2, 0, 0,
      'confirmed', now()
    )
    returning id
  `;
  assert.ok(visit, "the reconfirmation visit was not created");
  const [job] = await sql<{ id: string }[]>`
    insert into public.scheduled_jobs (home_id, visit_id, kind, due_at)
    values (
      ${household.homeId}, ${visit.id}, 'reconfirm_chase',
      now() - interval '1 minute'
    )
    returning id
  `;
  assert.ok(job, "the reconfirmation job was not created");
  const deadline = Date.now() + 90_000;
  for (;;) {
    await drainTicks(context);
    const [row] = await sql<{ status: string }[]>`
      select status from public.scheduled_jobs where id = ${job.id}
    `;
    if (row?.status === "done") break;
    assert.notEqual(
      row?.status,
      "quarantined",
      "the reconfirmation job was quarantined",
    );
    if (Date.now() >= deadline) {
      throw new ProbePausedError("the reconfirmation job did not finish");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const [state] = await sql<
    { status: string; chases: number; escalations: number }[]
  >`
    select
      visit.status,
      (
        select count(*)::int from public.notifications
        where visit_id = visit.id and recipient_kind = 'party'
          and recipient_id = visit.party_id and kind = 'reconfirm_chase'
      ) as chases,
      (
        select count(*)::int from public.scheduled_jobs
        where visit_id = visit.id and kind = 'reconfirm_escalate'
          and status = 'scheduled'
      ) as escalations
    from public.visits visit where visit.id = ${visit.id}
  `;
  assert.deepEqual(
    state,
    { status: "reconfirm_pending", chases: 1, escalations: 1 },
    "the chase must notify the guest once and schedule the escalation",
  );
  return "a past-due chase notified the guest and scheduled the escalation";
}

async function probeRoomCoordination(context: ProbeContext): Promise<string> {
  const { sql, household } = context;
  const vega = fixtureGuest(household, "Familia Vega");
  const roomIds = household.roomIds.slice(0, 2);
  const [result] = await runToTerminal(context, [
    {
      task: "guest_submit",
      homeId: household.homeId,
      invitationId: vega.invitationId,
      stay: fixtureStay(context.now, 28, 3),
      adults: 2,
      children: 2,
      pets: 0,
      roomIds,
      locale: "es",
    },
  ]);
  assert.equal(result?.status, "completed", "the room choice must complete");
  const rooms = await sql<{ room_id: string }[]>`
    select visit_room.room_id
    from public.visit_rooms visit_room
    join public.visits visit on visit.id = visit_room.visit_id
    where visit.invitation_id = ${vega.invitationId}
      and visit.status = 'confirmed'
  `;
  assert.deepEqual(
    rooms.map(({ room_id }) => room_id).sort(),
    [...roomIds].sort(),
    "selected room IDs must match the fixture's exact multi-room choice",
  );
  return "the confirmed visit holds exactly the two chosen rooms";
}

async function probeGuestIsolation({
  options,
  household,
  conflict,
}: ProbeContext): Promise<string> {
  const response = await fetch(`${options.baseUrl}/en/g/${"x".repeat(43)}`);
  assert.ok(response.ok, `invalid guest page returned HTTP ${response.status}`);
  const html = await response.text();
  assert.match(html, /data-status="invalid"/);
  for (const { familyName } of [...household.parties, ...conflict.parties]) {
    assert.ok(
      !html.includes(familyName),
      `the invalid guest page revealed "${familyName}"`,
    );
  }
  return "invalid token revealed no family identity";
}

function fixtureGuest(household: FixtureHousehold, familyName: string) {
  const guest = household.parties.find(
    (party) => party.familyName === familyName,
  );
  assert.ok(guest, `the probe household must invite ${familyName}`);
  return guest;
}

async function runToTerminal(
  context: ProbeContext,
  tasks: readonly AgentTask[],
): Promise<TerminalProbeRunResult[]> {
  const responses = await Promise.all(
    tasks.map((task) =>
      fetch(`${context.options.baseUrl}/api/agent/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-layalga-internal": context.agentRouteSecret,
        },
        body: JSON.stringify(task),
      }),
    ),
  );
  const acknowledgements = await Promise.all(
    responses.map((response, index) =>
      responseJson<unknown>(response, `agent run ${index + 1}`),
    ),
  );
  const runIds = queuedRunIds(acknowledgements);
  try {
    return await drainAndCollectTerminalRunResults(
      runIds,
      () => drainTicks(context),
      (exactRunIds) => context.sql`
        select id, status, result from public.runs
        where id = any(${context.sql.array([...exactRunIds])}::uuid[])
      `,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      /did not reach terminal status/.test(error.message)
    ) {
      throw new ProbePausedError(error.message);
    }
    throw error;
  }
}

async function drainTicks({
  options,
  tickSecret,
}: ProbeContext): Promise<void> {
  await responseJson(
    await fetch(`${options.baseUrl}/api/ticks`, {
      headers: { "x-layalga-internal": tickSecret },
    }),
    "queued probe drain",
  );
}

function assertExecutedOn(
  result: TerminalProbeRunResult,
  expectedRuntime: "local" | "agentcore" | undefined,
  label: string,
): void {
  if (!expectedRuntime) return;
  assert.equal(
    result.executedOn,
    expectedRuntime,
    `${label} run must execute on ${expectedRuntime}`,
  );
}

export function assertConcurrentRunsCompleted(
  results: readonly Pick<TerminalProbeRunResult, "status">[],
): void {
  assert.equal(results.length, 2, "expected two concurrent run results");
  assert.ok(
    results.every((result) => result.status === "completed"),
    "both concurrent runs must complete",
  );
}

export function queuedRunIds(results: readonly unknown[]): string[] {
  const acknowledgements = results.map((result) =>
    runResultSchema.parse(result),
  );
  assert.ok(
    acknowledgements.every((result) => result.status === "queued"),
    "agent runs must return a queued acknowledgement",
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
  const options = parseReleaseCliOptions(process.argv.slice(2));
  if (options.cleanupOnly) {
    const sql = postgres(requiredEnvironment("DATABASE_URL"), {
      prepare: false,
      max: 2,
    });
    try {
      const removed = await removeProbeHouseholds(sql, options.cleanupOnly);
      console.log(
        JSON.stringify({
          status: "cleaned",
          runId: options.cleanupOnly,
          removed,
        }),
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
    return;
  }
  const report = await runReleaseProbes(options);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "passed") {
    console.error(
      `Release probes ${report.status}. Remove any leftover fixture with: ${report.cleanupCommand}`,
    );
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
