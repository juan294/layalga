import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTemporaryHold, confirmVisit } from "@/core/booking/holds";
import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "./deps";
import { runAgentTask } from "./run-task";
import { ScriptedModel } from "./scripted-model";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });
const homeId = "20000000-0000-4000-8000-000000000001";
const hostId = "20000000-0000-4000-8000-000000000201";
const vegaInvitationId = "20000000-0000-4000-8000-000000000401";
const oterosInvitationId = "20000000-0000-4000-8000-000000000402";
const clock = new FakeClock(new Date("2026-09-07T08:00:00Z"));

describe("agent reschedule policy", () => {
  beforeEach(async () => {
    await sql`delete from public.homes where id = ${homeId}`;
    await sql`delete from public.agent_sessions where session_id like 'inv_20000000%'`;
    await sql`insert into public.homes (id, name, timezone) values (${homeId}, 'Reschedule home', 'Europe/Madrid')`;
    await sql`insert into public.rooms (home_id, name, beds) values (${homeId}, 'Large', 4), (${homeId}, 'Small', 2)`;
    await sql`insert into public.hosts (id, home_id, display_name, locale) values (${hostId}, ${homeId}, 'Nel', 'es')`;
    const vegaPartyId = "20000000-0000-4000-8000-000000000301";
    const oterosPartyId = "20000000-0000-4000-8000-000000000302";
    await sql`insert into public.parties (id, home_id, family_name, locale, link_token) values (${vegaPartyId}, ${homeId}, 'Vega', 'es', 'reschedule-vega'), (${oterosPartyId}, ${homeId}, 'Oteros', 'en', 'reschedule-oteros')`;
    await sql`insert into public.invitations (id, home_id, host_id, party_id, raw_message) values (${vegaInvitationId}, ${homeId}, ${hostId}, ${vegaPartyId}, 'Vega'), (${oterosInvitationId}, ${homeId}, ${hostId}, ${oterosPartyId}, 'Oteros')`;
  });
  afterAll(() => sql.end());

  it("re-asks for changed approval and denies a children conflict", async () => {
    const vega = await createTemporaryHold(sql, clock, { invitationId: vegaInvitationId, stay: ["2026-09-18", "2026-09-21"], adults: 2, children: 2 });
    await confirmVisit(sql, clock, vega.visitId);
    const oteros = await createTemporaryHold(sql, clock, { invitationId: oterosInvitationId, stay: ["2026-09-19", "2026-09-21"], adults: 2, pets: 1, specialRequests: ["wheelchair access"], approvedBy: hostId });
    const [before] = await sql<{ approval_stay_hash: string }[]>`
      select approval_stay_hash from public.visits where id = ${oteros.visitId}
    `;
    const [oldJob] = await sql<{ id: string }[]>`
      insert into public.scheduled_jobs (home_id, visit_id, kind, due_at)
      values (${homeId}, ${oteros.visitId}, 'reconfirm_chase', '2026-09-16T07:00:00Z')
      returning id
    `;
    const model = new ScriptedModel([
      { toolUse: { name: "reschedule_visit", input: { visitId: oteros.visitId, stay: ["2026-09-26", "2026-09-28"], specialRequests: ["wheelchair access"] } } },
      { text: "Visit rescheduled." },
    ]);
    const interrupted = await runAgentTask({ task: "guest_change", homeId, visitId: oteros.visitId, message: "26 to 28 September", locale: "en" }, deps(model));
    expect(interrupted.status).toBe("interrupted");
    expect((await stay(oteros.visitId))).toEqual(["2026-09-19", "2026-09-21"]);
    const [pd] = await sql<{ id: string; interrupt_id: string }[]>`select id, interrupt_id from public.pending_decisions where run_id = ${interrupted.runId}`;
    await recordApproval(pd!.id);
    const resumed = await runAgentTask({ task: "resume", homeId, sessionId: interrupted.sessionId, responses: [{ interruptId: pd!.interrupt_id, response: { approved: true, hostId } }] }, deps(model));
    expect(resumed.status).toBe("completed");
    expect(await stay(oteros.visitId)).toEqual(["2026-09-26", "2026-09-28"]);
    const [after] = await sql<{ approval_stay_hash: string }[]>`
      select approval_stay_hash from public.visits where id = ${oteros.visitId}
    `;
    expect(after?.approval_stay_hash).toBeTruthy();
    expect(after?.approval_stay_hash).not.toBe(before?.approval_stay_hash);
    const [cancelledOld] = await sql<{ status: string }[]>`
      select status from public.scheduled_jobs where id = ${oldJob!.id}
    `;
    expect(cancelledOld?.status).toBe("cancelled");
    const newJobs = await sql<{ id: string }[]>`
      select id from public.scheduled_jobs where visit_id = ${oteros.visitId}
        and kind = 'reconfirm_chase' and status = 'scheduled' and id <> ${oldJob!.id}
    `;
    expect(newJobs).toHaveLength(1);

    const [party] = await sql<{ id: string }[]>`insert into public.parties (home_id, family_name, locale, link_token) values (${homeId}, 'Third', 'en', ${crypto.randomUUID()}) returning id`;
    const [invite] = await sql<{ id: string }[]>`insert into public.invitations (home_id, host_id, party_id, raw_message) values (${homeId}, ${hostId}, ${party!.id}, 'Third family') returning id`;
    const third = await createTemporaryHold(sql, clock, { invitationId: invite!.id, stay: ["2026-09-25", "2026-09-27"], adults: 1, children: 1 });
    const denied = await runAgentTask({ task: "guest_change", homeId, visitId: third.visitId, message: "19 to 21 September", locale: "en" }, deps(new ScriptedModel([
      { toolUse: { name: "reschedule_visit", input: { visitId: third.visitId, stay: ["2026-09-19", "2026-09-21"] } } },
      { text: "Cannot move the visit because another family with children overlaps." },
    ])));
    expect(denied.status).toBe("completed");
    expect(denied.summary).toContain("children");
    expect(await stay(third.visitId)).toEqual(["2026-09-25", "2026-09-27"]);
    expect(
      await sql`select id from public.pending_decisions where run_id = ${denied.runId}`,
    ).toHaveLength(0);
  }, 30_000);
});

function deps(model: ScriptedModel) { return { db: sql, clock, scheduler: new NoopScheduler(), appUrl: "http://localhost:3008", locale: "en" as const, model }; }
async function stay(visitId: string) { const [row] = await sql<{ start: string; end: string }[]>`select lower(stay)::text as start, upper(stay)::text as end from public.visits where id = ${visitId}`; return [row!.start, row!.end]; }
async function recordApproval(id: string) {
  await sql`
    update public.pending_decisions
    set status = 'approved', decided_by_host_id = ${hostId},
      decided_at = '2026-09-07T08:00:00Z'
    where id = ${id}
  `;
}
