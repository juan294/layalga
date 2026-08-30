import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";

import type { RunResult } from "../src/agent/task";
import { MIN_INTERNAL_SECRET_BYTES } from "../src/app/api/agent/internal-auth";
import { hashLinkToken } from "../src/core/booking/invitations";
import { DEMO_SEED } from "./seed-demo";
import { runDemoE2E } from "./demo-e2e";
import {
  isDirectExecution,
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

export async function runReleaseProbes(
  options: ReleaseCliOptions,
): Promise<ProbeEvidence[]> {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const linkTokenSecret = requiredEnvironment("LINK_TOKEN_SECRET");
  const agentRouteSecret = requiredAgentRouteSecret();
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
    evidence.push(
      pass(2, "host capture", "two tagged tentative invitations created"),
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
      fixture,
    );
    evidence.push(
      pass(4, "concurrent conflict", "one hold won and one was rejected"),
    );

    await probeInterruptResume(sql, demo.rawMessages[1]);
    evidence.push(
      pass(5, "interrupt and resume", "one decision approved and applied once"),
    );

    assert.equal(demo.visits, 2);
    assert.equal(demo.escalatedVisits, 1);
    assert.equal(demo.notifications, 4);
    assert.equal(demo.hostEscalations, 2);
    evidence.push(
      pass(
        6,
        "clock reconfirmation",
        "four total notifications include exactly two host escalations",
      ),
    );

    await probeUnauthorizedGuest(options.baseUrl);
    evidence.push(
      pass(7, "guest isolation", "invalid token revealed no family identity"),
    );
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      await cleanupDemoArtifacts(sql, runMarker, linkTokenSecret);
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
        pass(8, "synthetic cleanup", `deleted probe rows tagged ${runId}`),
      );
    }
  }

  assert.equal(evidence.length, 8, "all eight release probes must pass");
  return evidence;
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
      insert into public.rooms (home_id, name, beds)
      values (${home.id}, ${`Only room ${runId}`}, 2)
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
    "the internal agent route must complete both policy outcomes",
  );
  const results = await Promise.all(
    responses.map((response, index) =>
      responseJson<RunResult>(response, `concurrent agent run ${index + 1}`),
    ),
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
  const suffix = ` [${runMarker}]`;
  const cleanedSessionIds = await sql.begin(async (transaction) => {
    const invitations = await transaction<{ id: string }[]>`
      select id
      from public.invitations
      where home_id = ${DEMO_SEED.home.id}
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
    const sessionIds = [
      ...DEMO_SEED.hosts.map((host) => `capture_${host.id}`),
      ...invitationIds.map((id) => `inv_${id}`),
      ...jobs.map(({ id }) => `tick_${id}`),
    ];
    const runs = await transaction<{ id: string }[]>`
      select id
      from public.runs
      where home_id = ${DEMO_SEED.home.id}
        and (
          session_id = any(${transaction.array(sessionIds)}::text[])
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
    if (sessionIds.length > 0) {
      await transaction`
        delete from public.agent_sessions
        where session_id = any(${transaction.array(sessionIds)}::text[])
      `;
    }
    if (invitationIds.length > 0) {
      await transaction`
        delete from public.invitations
        where id = any(${transaction.array(invitationIds)}::uuid[])
      `;
    }

    for (const party of DEMO_SEED.parties) {
      const token = party.guestLink.split("/").at(-1);
      assert.ok(token, `seed token missing for ${party.familyName}`);
      await transaction`
        update public.parties
        set locale = ${party.locale},
          link_token = ${hashLinkToken(token, linkTokenSecret)},
          link_token_expires_at = ${party.linkTokenExpiresAt}
        where id = ${party.id} and home_id = ${DEMO_SEED.home.id}
      `;
    }
    return sessionIds;
  });

  const [remaining] = await sql<
    {
      invitations: number;
      runs: number;
      sessions: number;
    }[]
  >`
    select
      (
        select count(*)::integer from public.invitations
        where home_id = ${DEMO_SEED.home.id}
          and right(raw_message, length(${suffix})) = ${suffix}
      ) as invitations,
      (
        select count(*)::integer from public.runs
        where home_id = ${DEMO_SEED.home.id}
          and (
            right(payload->>'rawMessage', length(${suffix})) = ${suffix}
            or session_id = any(${sql.array(cleanedSessionIds)}::text[])
          )
      ) as runs,
      (
        select count(*)::integer from public.agent_sessions
        where session_id = any(${sql.array(cleanedSessionIds)}::text[])
      ) as sessions
  `;
  assert.deepEqual(
    remaining,
    { invitations: 0, runs: 0, sessions: 0 },
    "tagged demo cleanup was incomplete",
  );
}

function pass(probe: number, name: string, detail: string): ProbeEvidence {
  return { probe, name, status: "passed", detail };
}

function requiredAgentRouteSecret(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const secret = env.AGENT_ROUTE_SECRET;
  if (!secret) throw new Error("AGENT_ROUTE_SECRET is required");
  if (Buffer.byteLength(secret) < MIN_INTERNAL_SECRET_BYTES) {
    throw new Error(
      `AGENT_ROUTE_SECRET must be at least ${MIN_INTERNAL_SECRET_BYTES} bytes`,
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
