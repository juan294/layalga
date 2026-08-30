import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { applyDataRetention } from "./data-retention";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false, max: 2 });

describe("state-aware data retention", () => {
  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("redacts terminal personal data but preserves active work and audit evidence", async () => {
    const suffix = randomUUID();
    const old = "2025-01-01T00:00:00.000Z";
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Retention ${suffix}`}, 'Europe/Madrid')
      returning id
    `;
    if (!home) throw new Error("Failed to seed retention home");
    const [host] = await sql<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home.id}, 'Host', 'en') returning id
    `;
    const [party] = await sql<{ id: string }[]>`
      insert into public.parties (
        home_id, family_name, locale, link_token, link_token_expires_at
      ) values (${home.id}, 'Private family', 'en', ${randomUUID()}, '2027-01-01')
      returning id
    `;
    if (!host || !party) throw new Error("Failed to seed retention identities");
    const [invitation] = await sql<{ id: string }[]>`
      insert into public.invitations (
        home_id, host_id, party_id, raw_message, structured, status, created_at,
        link_token, link_token_expires_at
      ) values (
        ${home.id}, ${host.id}, ${party.id}, 'Private invitation text',
        ${JSON.stringify({ access: "step-free" })}::text::jsonb, 'converted', ${old},
        ${randomUUID()}, '2025-02-01'
      ) returning id
    `;
    if (!invitation) throw new Error("Failed to seed retention invitation");
    const [visit] = await sql<{ id: string }[]>`
      insert into public.visits (
        home_id, party_id, invitation_id, stay, adults, special_requests,
        status, created_at
      ) values (
        ${home.id}, ${party.id}, ${invitation.id}, '[2025-01-10,2025-01-12)', 2,
        array['Private accessibility need'], 'cancelled', ${old}
      ) returning id
    `;
    if (!visit) throw new Error("Failed to seed retention visit");
    const [scheduledInvitation] = await sql<{ id: string }[]>`
      insert into public.invitations (
        home_id, host_id, party_id, raw_message, structured, status, created_at,
        link_token, link_token_expires_at
      ) values (
        ${home.id}, ${host.id}, ${party.id}, 'Required scheduled invitation',
        '{}'::jsonb, 'converted', ${old}, ${randomUUID()}, '2025-02-01'
      ) returning id
    `;
    if (!scheduledInvitation) {
      throw new Error("Failed to seed scheduled invitation");
    }
    const [scheduledVisit] = await sql<{ id: string }[]>`
      insert into public.visits (
        home_id, party_id, invitation_id, stay, adults, status, created_at
      ) values (
        ${home.id}, ${party.id}, ${scheduledInvitation.id},
        '[2025-01-10,2025-01-12)', 2, 'cancelled', ${old}
      ) returning id
    `;
    if (!scheduledVisit) throw new Error("Failed to seed scheduled visit");
    const [scheduledJob] = await sql<{ id: string }[]>`
      insert into public.scheduled_jobs (
        home_id, visit_id, kind, due_at, status, created_at
      ) values (
        ${home.id}, ${scheduledVisit.id}, 'reconfirm_chase',
        '2025-01-01T00:00:00.000Z', 'scheduled', ${old}
      ) returning id
    `;
    if (!scheduledJob) throw new Error("Failed to seed scheduled job");
    const [terminalRun] = await sql<{ id: string }[]>`
      insert into public.runs (
        home_id, session_id, task, status, payload, result, started_at, finished_at
      ) values (
        ${home.id}, ${`terminal_${suffix}`}, 'guest_submit', 'completed',
        ${JSON.stringify({ notes: "Private run input" })}::text::jsonb,
        ${JSON.stringify({ summary: "Private result" })}::text::jsonb,
        ${old}, ${old}
      ) returning id
    `;
    const [activeRun] = await sql<{ id: string }[]>`
      insert into public.runs (
        home_id, session_id, task, status, payload, started_at
      ) values (
        ${home.id}, ${`active_${suffix}`}, 'guest_submit', 'interrupted',
        ${JSON.stringify({ notes: "Required active input" })}::text::jsonb,
        ${old}
      ) returning id
    `;
    if (!terminalRun || !activeRun) throw new Error("Failed to seed retention runs");
    await sql`
      insert into public.pending_decisions (
        home_id, run_id, agent_session_id, interrupt_id,
        interrupt_name, reason, status, created_at
      ) values (
        ${home.id}, ${activeRun.id}, ${`active_${suffix}`},
        ${`interrupt_${suffix}`}, 'host_decision', '{}'::jsonb, 'pending', ${old}
      )
    `;
    await sql`
      insert into public.agent_sessions (key, session_id, data, updated_at)
      values
        (${`terminal_${suffix}/session`}, ${`terminal_${suffix}`}, ${new Uint8Array([1])}, ${old}),
        (${`active_${suffix}/session`}, ${`active_${suffix}`}, ${new Uint8Array([2])}, ${old}),
        (${`tick_${scheduledJob.id}/session`}, ${`tick_${scheduledJob.id}`}, ${new Uint8Array([3])}, ${old})
    `;
    await sql`
      insert into public.audit_events (
        home_id, run_id, actor, kind, payload, created_at
      ) values (
        ${home.id}, ${terminalRun.id}, 'agent', 'private_event',
        ${JSON.stringify({ private: "audit detail" })}::text::jsonb, ${old}
      )
    `;

    try {
      await applyDataRetention(sql, new Date("2026-08-31T00:00:00.000Z"));

      const [terminal] = await sql<{ payload: unknown; result: unknown }[]>`
        select payload, result from public.runs where id = ${terminalRun.id}
      `;
      const [active] = await sql<{ payload: unknown }[]>`
        select payload from public.runs where id = ${activeRun.id}
      `;
      expect(terminal).toEqual({ payload: {}, result: null });
      expect(active?.payload).toEqual({ notes: "Required active input" });

      const sessions = await sql<{ session_id: string }[]>`
        select session_id from public.agent_sessions
        where session_id in (
          ${`terminal_${suffix}`},
          ${`active_${suffix}`},
          ${`tick_${scheduledJob.id}`}
        )
        order by session_id
      `;
      expect(sessions.map(({ session_id: sessionId }) => sessionId)).toEqual(
        [`active_${suffix}`, `tick_${scheduledJob.id}`].sort(),
      );

      const [retainedInvitation] = await sql<
        { raw_message: string; structured: unknown }[]
      >`
        select raw_message, structured
        from public.invitations where id = ${invitation.id}
      `;
      const [retainedVisit] = await sql<{ special_requests: string[] }[]>`
        select special_requests from public.visits where id = ${visit.id}
      `;
      const [audit] = await sql<{ actor: string; kind: string; payload: unknown }[]>`
        select actor, kind, payload from public.audit_events
        where run_id = ${terminalRun.id}
      `;
      expect(retainedInvitation).toEqual({ raw_message: "", structured: {} });
      expect(retainedVisit?.special_requests).toEqual([]);
      expect(audit).toEqual({ actor: "agent", kind: "private_event", payload: {} });
      const [retainedScheduledInvitation] = await sql<
        { raw_message: string }[]
      >`
        select raw_message from public.invitations
        where id = ${scheduledInvitation.id}
      `;
      expect(retainedScheduledInvitation?.raw_message).toBe(
        "Required scheduled invitation",
      );
    } finally {
      await sql`delete from public.homes where id = ${home.id}`;
      await sql`
        delete from public.agent_sessions
        where session_id in (
          ${`terminal_${suffix}`},
          ${`active_${suffix}`},
          ${`tick_${scheduledJob.id}`}
        )
      `;
    }
  });
});
