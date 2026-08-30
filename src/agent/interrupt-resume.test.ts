import { execFileSync } from "node:child_process";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "./deps";
import { runAgentTask } from "./run-task";
import { ScriptedModel } from "./scripted-model";
import type { AgentTask } from "./task";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });
const homeId = "10000000-0000-4000-8000-000000000001";
const invitationId = "10000000-0000-4000-8000-000000000402";
const declinedInvitationId = "10000000-0000-4000-8000-000000000403";
const hostId = "10000000-0000-4000-8000-000000000201";

describe("interrupt and resume", () => {
  beforeEach(async () => {
    await sql`delete from public.homes where id = ${homeId}`;
    await sql`delete from public.agent_sessions where session_id like 'inv_10000000%'`;
    await sql`insert into public.homes (id, name, timezone) values (${homeId}, 'Interrupt home', 'Europe/Madrid')`;
    await sql`insert into public.rooms (home_id, name, beds) values (${homeId}, 'Room', 3)`;
    await sql`insert into public.hosts (id, home_id, display_name, locale) values (${hostId}, ${homeId}, 'Nel', 'es')`;
    const partyId = "10000000-0000-4000-8000-000000000302";
    const declinedPartyId = "10000000-0000-4000-8000-000000000303";
    await sql`insert into public.parties (id, home_id, family_name, locale, link_token) values (${partyId}, ${homeId}, 'Oteros', 'en', 'interrupt-token')`;
    await sql`insert into public.parties (id, home_id, family_name, locale, link_token) values (${declinedPartyId}, ${homeId}, 'Declined', 'en', 'decline-token')`;
    await sql`insert into public.invitations (id, home_id, host_id, party_id, raw_message, structured) values (${invitationId}, ${homeId}, ${hostId}, ${partyId}, 'Wheelchair', ${sql.json({ specialRequests: ["wheelchair access"] })})`;
    await sql`insert into public.invitations (id, home_id, host_id, party_id, raw_message, structured) values (${declinedInvitationId}, ${homeId}, ${hostId}, ${declinedPartyId}, 'Special request', ${sql.json({ specialRequests: ["quiet room"] })})`;
  });
  afterAll(() => sql.end());

  it("resumes an approved tool exactly once in a new process", async () => {
    const first = await runAgentTask(
      submit(),
      deps(
        new ScriptedModel([
          {
            toolUse: {
              name: "create_temporary_hold",
              input: holdInput(invitationId),
            },
          },
          { text: "unused before restart" },
        ]),
      ),
    );
    expect(first.status).toBe("interrupted");
    const [decision] = await sql<
      {
        id: string;
        interrupt_id: string;
        interrupt_name: string;
        reason: { decision: string } | string;
      }[]
    >`
      select id, interrupt_id, interrupt_name, reason from public.pending_decisions where run_id = ${first.runId}
    `;
    const reason =
      typeof decision?.reason === "string"
        ? JSON.parse(decision.reason)
        : decision?.reason;
    expect(reason?.decision).toBe("interrupt");
    expect(decision?.interrupt_name).toBe("host_decision");
    expect(
      await sql`select id from public.visits where home_id = ${homeId}`,
    ).toHaveLength(0);
    await recordDecision(decision!.id, "approved");
    const [recorded] = await sql<
      { status: string; applied_run_id: string | null }[]
    >`
      select status, applied_run_id
      from public.pending_decisions where id = ${decision!.id}
    `;
    expect(recorded).toEqual({ status: "approved", applied_run_id: null });
    await expect(
      runAgentTask(
        {
          task: "resume",
          homeId,
          sessionId: first.sessionId,
          responses: [
            {
              interruptId: decision!.interrupt_id,
              response: { approved: true, hostId, note: "wrong note" },
            },
          ],
        },
        deps(new ScriptedModel([])),
      ),
    ).rejects.toThrow("has not been recorded by this host");
    const [retryable] = await sql<
      { status: string; application_error: string | null }[]
    >`
      select status, application_error
      from public.pending_decisions where id = ${decision!.id}
    `;
    expect(retryable?.status).toBe("approved");
    expect(retryable?.application_error).toContain("has not been recorded");

    const stdout = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/agent/test-support/resume-child.ts",
        first.sessionId,
        decision!.interrupt_id,
        JSON.stringify({ approved: true, hostId }),
        homeId,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: url },
        encoding: "utf8",
      },
    );
    const resumed = JSON.parse(stdout) as { runId: string; status: string };
    expect(resumed.status).toBe("completed");
    const visits = await sql<
      { status: string; approval_stay_hash: string | null }[]
    >`
      select status, approval_stay_hash from public.visits where invitation_id = ${invitationId}
    `;
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ status: "hold" });
    expect(visits[0]?.approval_stay_hash).toBeTruthy();
    const audits = await sql<{ payload: { name: string } }[]>`
      select payload from public.audit_events where run_id = ${resumed.runId}
        and kind = 'tool_call'
        and payload->>'name' = 'create_temporary_hold'
    `;
    expect(audits).toHaveLength(1);
    const applied = await sql<
      { payload: { pendingDecisionId: string; interruptId: string } }[]
    >`
      select payload from public.audit_events where kind = 'decision_applied'
        and payload->>'pendingDecisionId' = ${decision!.id}
    `;
    expect(applied).toHaveLength(1);
    expect(applied[0]?.payload.interruptId).toBe(decision!.interrupt_id);
    const [finalDecision] = await sql<
      { status: string; applied_run_id: string }[]
    >`
      select status, applied_run_id
      from public.pending_decisions where id = ${decision!.id}
    `;
    expect(finalDecision).toEqual({
      status: "approved",
      applied_run_id: resumed.runId,
    });

    const declinedModel = new ScriptedModel([
      {
        toolUse: {
          name: "create_temporary_hold",
          input: {
            ...holdInput(declinedInvitationId),
            stay: ["2026-09-22", "2026-09-24"],
            specialRequests: ["quiet room"],
          },
        },
      },
      { text: "Declined by host: not this weekend." },
    ]);
    const declinedFirst = await runAgentTask(
      submit(declinedInvitationId),
      deps(declinedModel),
    );
    const [declinedDecision] = await sql<
      { id: string; interrupt_id: string }[]
    >`
      select id, interrupt_id from public.pending_decisions where run_id = ${declinedFirst.runId}
    `;
    await recordDecision(declinedDecision!.id, "declined", "not this weekend");
    const declined = await runAgentTask(
      {
        task: "resume",
        homeId,
        sessionId: declinedFirst.sessionId,
        responses: [
          {
            interruptId: declinedDecision!.interrupt_id,
            response: {
              approved: false,
              hostId,
              note: "not this weekend",
            },
          },
        ],
      },
      deps(declinedModel),
    );
    expect(declined.status).toBe("completed");
    expect(declined.summary).toContain("Declined by host");
    expect(
      await sql`select id from public.visits where invitation_id = ${declinedInvitationId}`,
    ).toHaveLength(0);
  }, 30_000);
});

function submit(id = invitationId): AgentTask {
  return {
    task: "guest_submit",
    homeId,
    invitationId: id,
    stay: ["2026-09-19", "2026-09-21"],
    adults: 2,
    children: 0,
    pets: 1,
    notes: "wheelchair access",
    locale: "en",
  };
}
function holdInput(id: string) {
  return {
    invitationId: id,
    stay: ["2026-09-19", "2026-09-21"],
    adults: 2,
    children: 0,
    pets: 1,
    specialRequests: ["wheelchair access"],
  };
}
function deps(model: ScriptedModel) {
  return {
    db: sql,
    clock: new FakeClock(new Date("2026-09-07T08:00:00Z")),
    scheduler: new NoopScheduler(),
    appUrl: "http://localhost:3000",
    locale: "en" as const,
    model,
  };
}
async function recordDecision(
  id: string,
  status: "approved" | "declined",
  note?: string,
) {
  await sql`
    update public.pending_decisions
    set status = ${status}, decided_by_host_id = ${hostId},
      decided_at = '2026-09-07T08:00:00Z', note = ${note ?? null}
    where id = ${id}
  `;
}
