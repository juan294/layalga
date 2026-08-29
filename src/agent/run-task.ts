import {
  InterruptResponseContent,
  type BaseModelConfig,
  type Model,
} from "@strands-agents/sdk";

import { sqlClient } from "@/core/db/client";

import { buildAgent } from "./agent";
import type { AgentDeps } from "./deps";
import { agentTaskSchema, type AgentTask, type RunResult } from "./task";

export interface RunAgentDeps extends AgentDeps {
  model?: Model<BaseModelConfig>;
}

export async function runAgentTask(
  payload: AgentTask,
  deps: RunAgentDeps,
): Promise<RunResult> {
  const task = agentTaskSchema.parse(payload);
  const sql = sqlClient(deps.db);
  const sessionId = await resolveSessionId(task, deps);
  const [run] = await sql<{ id: string }[]>`
    insert into public.runs (home_id, session_id, task, payload)
    values (${task.homeId}, ${sessionId}, ${task.task}, ${JSON.stringify(task)}::text::jsonb)
    returning id
  `;
  if (!run) throw new Error("Failed to start agent run");

  try {
    if (task.task === "guest_reconfirm" && task.answer === "yes") {
      await sql`
        update public.visits
        set status = 'reconfirmed', reconfirmed_at = ${deps.clock.now().toISOString()}
        where id = ${task.visitId}
      `;
      await sql`
        update public.scheduled_jobs set status = 'cancelled'
        where visit_id = ${task.visitId} and status in ('scheduled', 'running')
      `;
      return await finish(sql, run.id, sessionId, "Reconfirmed");
    }

    const resumeDecisions: { id: string; interruptId: string }[] = [];
    if (task.task === "resume") {
      for (const { interruptId, response } of task.responses) {
        const [decision] = await sql<
          {
            id: string;
            status: "pending" | "approved" | "declined";
            decided_by_host_id: string | null;
            note: string | null;
          }[]
        >`
          select id, status, decided_by_host_id, note
          from public.pending_decisions
          where agent_session_id = ${sessionId} and interrupt_id = ${interruptId}
        `;
        if (!decision)
          throw new Error(`Pending decision not found: ${interruptId}`);
        const expectedStatus = response.approved ? "approved" : "declined";
        if (
          decision.status !== expectedStatus ||
          decision.decided_by_host_id !== response.hostId ||
          decision.note !== (response.note ?? null)
        ) {
          throw new Error(
            `Pending decision has not been recorded by this host: ${interruptId}`,
          );
        }
        resumeDecisions.push({ id: decision.id, interruptId });
      }
    }

    const agent = buildAgent({ sessionId, deps, model: deps.model });
    const invokeArgs =
      task.task === "resume"
        ? task.responses.map(
            ({ interruptId, response }) =>
              new InterruptResponseContent({ interruptId, response }),
          )
        : await buildPrompt(task, deps);
    const result = await agent.invoke(invokeArgs, {
      invocationState: { runId: run.id },
    });

    if (result.stopReason === "interrupt") {
      const ids: string[] = [];
      for (const interrupt of result.interrupts ?? []) {
        const [decision] = await sql<{ id: string }[]>`
          insert into public.pending_decisions (
            home_id, run_id, agent_session_id, interrupt_id, interrupt_name, reason
          ) values (
            ${task.homeId}, ${run.id}, ${sessionId}, ${interrupt.id},
            ${interrupt.name}, ${JSON.stringify(interrupt.reason ?? null)}::text::jsonb
          )
          on conflict (agent_session_id, interrupt_id) do update
          set reason = excluded.reason
          returning id
        `;
        if (decision) ids.push(decision.id);
      }
      await sql`
        update public.runs set status = 'interrupted', result = ${JSON.stringify(
          {
            summary: result.toString(),
          },
        )}::text::jsonb, finished_at = ${deps.clock.now().toISOString()} where id = ${run.id}
      `;
      return {
        runId: run.id,
        status: "interrupted",
        sessionId,
        pendingDecisionIds: ids,
        summary: result.toString(),
      };
    }

    if (task.task === "resume") {
      for (const decision of resumeDecisions) {
        await sql`
          insert into public.audit_events (home_id, run_id, actor, kind, payload)
          values (
            ${task.homeId}, ${run.id}, 'agent', 'decision_applied',
            ${JSON.stringify({
              pendingDecisionId: decision.id,
              runId: run.id,
              interruptId: decision.interruptId,
            })}::text::jsonb
          )
        `;
      }
    }
    return await finish(sql, run.id, sessionId, result.toString());
  } catch (error) {
    const summary = error instanceof Error ? error.message : String(error);
    await sql`
      update public.runs set status = 'failed', result = ${JSON.stringify({ summary })}::text::jsonb,
        finished_at = ${deps.clock.now().toISOString()} where id = ${run.id}
    `;
    throw error;
  }
}

async function finish(
  sql: ReturnType<typeof sqlClient>,
  runId: string,
  sessionId: string,
  summary: string,
): Promise<RunResult> {
  await sql`
    update public.runs set status = 'completed', result = ${JSON.stringify({ summary })}::text::jsonb,
      finished_at = now() where id = ${runId}
  `;
  return {
    runId,
    status: "completed",
    sessionId,
    pendingDecisionIds: [],
    summary,
  };
}

async function resolveSessionId(
  task: AgentTask,
  deps: AgentDeps,
): Promise<string> {
  if (task.task === "resume") return task.sessionId;
  if (task.task === "tick") return `tick_${task.jobId}`;
  if (task.task === "guest_submit") return `inv_${task.invitationId}`;
  const sql = sqlClient(deps.db);
  if (task.task === "guest_change" || task.task === "guest_reconfirm") {
    const [row] = await sql<{ invitation_id: string }[]>`
      select invitation_id from public.visits where id = ${task.visitId}
    `;
    if (!row) throw new Error(`Visit not found: ${task.visitId}`);
    return `inv_${row.invitation_id}`;
  }
  return `capture_${task.hostId}`;
}

async function buildPrompt(
  task: Exclude<AgentTask, { task: "resume" }>,
  deps: AgentDeps,
): Promise<string> {
  const sql = sqlClient(deps.db);
  if (task.task === "host_capture") {
    const [host] = await sql<{ display_name: string }[]>`
      select display_name from public.hosts where id = ${task.hostId}
    `;
    return `${host?.display_name ?? "The host"} pasted this invitation (locale ${task.locale}): """${task.rawMessage}""". Structure it with capture_invitation and reply with the guest link and a one-line summary for the host.`;
  }
  if (task.task === "guest_submit") {
    const [party] = await sql<{ family_name: string }[]>`
      select p.family_name from public.invitations i join public.parties p on p.id = i.party_id
      where i.id = ${task.invitationId}
    `;
    return `Party ${party?.family_name ?? "guest"} (invitation ${task.invitationId}) chose ${task.stay.join(" to ")}, ${task.adults} adults, ${task.children} children, ${task.pets} pets, arrival ${task.arrivalTime ?? "not given"}, notes: ${task.notes ?? "none"}. Place a hold, then confirm it, and tell the guest what happens next in their language.`;
  }
  if (
    task.task === "guest_change" ||
    (task.task === "guest_reconfirm" && task.answer === "change")
  ) {
    const [visit] = await sql<{ family_name: string }[]>`
      select p.family_name from public.visits v join public.parties p on p.id = v.party_id
      where v.id = ${task.visitId}
    `;
    return `Party ${visit?.family_name ?? "guest"} asks to change visit ${task.visitId}: """${task.message ?? "Please change the stay"}""". Use find_visit_options if dates are unclear, then reschedule_visit.`;
  }
  if (task.task === "guest_reconfirm") return "Record the reconfirmation.";
  const [job] = await sql<
    {
      kind: string;
      visit_id: string;
      family_name: string;
      stay_start: string;
    }[]
  >`
    select j.kind, j.visit_id, p.family_name, lower(v.stay)::text as stay_start
    from public.scheduled_jobs j join public.visits v on v.id = j.visit_id
    join public.parties p on p.id = v.party_id where j.id = ${task.jobId}
  `;
  if (!job) throw new Error(`Scheduled job not found: ${task.jobId}`);
  if (job.kind === "reconfirm_chase") {
    return `Visit ${job.visit_id} for ${job.family_name} starts ${job.stay_start}. Write the reconfirmation request to the party with notify (kind 'reconfirm_chase'); do not change the booking.`;
  }
  return `Visit ${job.visit_id} for ${job.family_name} was not reconfirmed within 24 hours. Tell both hosts with notify (kind 'reconfirm_escalation', one call per host) what is at stake and what they can do.`;
}
