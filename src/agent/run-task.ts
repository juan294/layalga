import {
  InterruptResponseContent,
  type BaseModelConfig,
  type Model,
} from "@strands-agents/sdk";

import { sqlClient } from "@/core/db/client";
import { applyGuestReconfirmation } from "@/core/reconfirmation/apply-guest-answer";
import { reconcileStaleRuns } from "@/core/reconfirmation/jobs";

import { buildAgent } from "./agent";
import type { AgentAuthority, AgentDeps } from "./deps";
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
  const authority = await authorityForTask(task, deps);
  const scopedDeps: RunAgentDeps = { ...deps, authority };
  const sessionId = await resolveSessionId(task, scopedDeps);
  await reconcileStaleRuns(deps.db, deps.clock.now(), task.homeId);
  const startedAt = deps.clock.now();
  const deadlineAt = new Date(startedAt.getTime() + 6 * 60 * 1_000);
  const [run] = await sql<{ id: string }[]>`
    insert into public.runs (
      home_id, session_id, task, payload, heartbeat_at, deadline_at
    ) values (
      ${task.homeId}, ${sessionId}, ${task.task},
      ${JSON.stringify(task)}::text::jsonb, ${startedAt.toISOString()},
      ${deadlineAt.toISOString()}
    )
    returning id
  `;
  if (!run) throw new Error("Failed to start agent run");

  try {
    if (task.task === "guest_reconfirm" && task.answer === "yes") {
      await applyGuestReconfirmation(
        deps.db,
        deps.clock,
        deps.scheduler,
        task.homeId,
        task.visitId,
        "yes",
      );
      return await finish(
        sql,
        run.id,
        sessionId,
        "Reconfirmed",
        deps.clock.now(),
      );
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
      for (const decision of resumeDecisions) {
        const [claimed] = await sql<{ id: string }[]>`
          update public.pending_decisions
          set applied_run_id = ${run.id}, application_error = null
          where id = ${decision.id} and home_id = ${task.homeId}
            and (applied_run_id is null or applied_run_id = ${run.id})
          returning id
        `;
        if (!claimed) {
          throw new Error(
            `Pending decision is already being applied: ${decision.interruptId}`,
          );
        }
      }
    }

    const agent = buildAgent({
      sessionId,
      deps: scopedDeps,
      model: deps.model,
    });
    const invokeArgs =
      task.task === "resume"
        ? task.responses.map(
            ({ interruptId, response }) =>
              new InterruptResponseContent({ interruptId, response }),
          )
        : await buildPrompt(task, scopedDeps);
    await sql`
      update public.runs set heartbeat_at = ${deps.clock.now().toISOString()}
      where id = ${run.id} and status = 'running'
    `;
    const result = await agent.invoke(invokeArgs, {
      invocationState: { runId: run.id },
      cancelSignal: AbortSignal.timeout(290_000),
    });
    if (result.stopReason === "cancelled") {
      throw new Error("Agent execution budget exceeded");
    }

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
        )}::text::jsonb, finished_at = ${deps.clock.now().toISOString()}
        where id = ${run.id} and status = 'running'
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
        await sql.begin(async (transaction) => {
          const [applied] = await transaction<{ id: string }[]>`
            update public.pending_decisions
            set applied_run_id = ${run.id}, application_error = null
            where id = ${decision.id}
              and home_id = ${task.homeId}
              and applied_run_id = ${run.id}
            returning id
          `;
          if (!applied) return;
          await transaction`
            insert into public.audit_events (home_id, run_id, actor, kind, payload)
            select ${task.homeId}, ${run.id}, 'agent', 'decision_applied',
              ${JSON.stringify({
                pendingDecisionId: decision.id,
                runId: run.id,
                interruptId: decision.interruptId,
              })}::text::jsonb
            where not exists (
              select 1 from public.audit_events
              where kind = 'decision_applied'
                and payload->>'pendingDecisionId' = ${decision.id}
            )
          `;
        });
      }
    }
    return await finish(
      sql,
      run.id,
      sessionId,
      result.toString(),
      deps.clock.now(),
    );
  } catch (error) {
    const summary = error instanceof Error ? error.message : String(error);
    await sql`
      update public.runs set status = 'failed', result = ${JSON.stringify({ summary })}::text::jsonb,
        finished_at = ${deps.clock.now().toISOString()}
        where id = ${run.id} and status = 'running'
    `;
    if (task.task === "resume") {
      await sql`
        update public.pending_decisions
        set application_error = ${summary},
          applied_run_id = case
            when applied_run_id = ${run.id}
              and not exists (
                select 1 from public.audit_events
                where kind = 'decision_applied'
                  and payload->>'pendingDecisionId' = public.pending_decisions.id::text
              ) then null
            else applied_run_id
          end
        where agent_session_id = ${sessionId}
          and interrupt_id in ${sql(task.responses.map(({ interruptId }) => interruptId))}
          and status in ('approved', 'declined')
          and (applied_run_id is null or applied_run_id = ${run.id})
      `;
    }
    throw error;
  }
}

async function finish(
  sql: ReturnType<typeof sqlClient>,
  runId: string,
  sessionId: string,
  summary: string,
  now: Date,
): Promise<RunResult> {
  const [completed] = await sql<{ id: string }[]>`
    update public.runs set status = 'completed', result = ${JSON.stringify({ summary })}::text::jsonb,
      finished_at = ${now.toISOString()}, heartbeat_at = ${now.toISOString()}
      where id = ${runId} and status = 'running'
      returning id
  `;
  if (!completed) throw new Error(`Agent run is no longer active: ${runId}`);
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
      select invitation_id from public.visits
      where id = ${task.visitId} and home_id = ${task.homeId}
    `;
    if (!row) throw new Error(`Visit not found: ${task.visitId}`);
    return `inv_${row.invitation_id}`;
  }
  return `capture_${task.hostId}`;
}

async function authorityForTask(
  task: AgentTask,
  deps: AgentDeps,
): Promise<AgentAuthority> {
  const sql = sqlClient(deps.db);
  if (task.task === "host_capture") {
    const [host] = await sql<{ id: string }[]>`
      select id from public.hosts
      where id = ${task.hostId} and home_id = ${task.homeId}
    `;
    if (!host) throw new Error("Host does not belong to the task home");
    return { homeId: task.homeId, hostId: task.hostId };
  }
  if (task.task === "guest_submit") {
    const [invitation] = await sql<{ id: string }[]>`
      select id from public.invitations
      where id = ${task.invitationId} and home_id = ${task.homeId}
        and status <> 'cancelled'
    `;
    if (!invitation)
      throw new Error("Invitation does not belong to the task home");
    return { homeId: task.homeId, invitationId: task.invitationId };
  }
  if (task.task === "guest_change" || task.task === "guest_reconfirm") {
    const [visit] = await sql<{ invitation_id: string }[]>`
      select invitation_id from public.visits
      where id = ${task.visitId} and home_id = ${task.homeId}
    `;
    if (!visit) throw new Error("Visit does not belong to the task home");
    return {
      homeId: task.homeId,
      invitationId: visit.invitation_id,
      visitId: task.visitId,
    };
  }
  if (task.task === "tick") {
    const [job] = await sql<{ visit_id: string }[]>`
      select visit_id from public.scheduled_jobs
      where id = ${task.jobId} and home_id = ${task.homeId}
    `;
    if (!job) throw new Error("Scheduled job does not belong to the task home");
    return { homeId: task.homeId, jobId: task.jobId, visitId: job.visit_id };
  }

  for (const { interruptId, response } of task.responses) {
    const [decision] = await sql<{ id: string }[]>`
      select id from public.pending_decisions
      where home_id = ${task.homeId}
        and agent_session_id = ${task.sessionId}
        and interrupt_id = ${interruptId}
    `;
    if (!decision) throw new Error("Decision does not belong to the task home");
    const [host] = await sql<{ id: string }[]>`
      select id from public.hosts
      where id = ${response.hostId} and home_id = ${task.homeId}
    `;
    if (!host)
      throw new Error("Decision host does not belong to the task home");
  }
  if (task.sessionId.startsWith("inv_")) {
    const invitationId = task.sessionId.slice(4);
    const [record] = await sql<{ visit_id: string | null }[]>`
      select v.id as visit_id
      from public.invitations i
      left join public.visits v on v.invitation_id = i.id and v.home_id = i.home_id
      where i.id = ${invitationId} and i.home_id = ${task.homeId}
      order by v.created_at desc nulls last
      limit 1
    `;
    if (!record)
      throw new Error("Agent session invitation is outside the task home");
    return {
      homeId: task.homeId,
      invitationId,
      visitId: record.visit_id ?? undefined,
    };
  }
  if (task.sessionId.startsWith("capture_")) {
    const hostId = task.sessionId.slice(8);
    const [host] = await sql<{ id: string }[]>`
      select id from public.hosts where id = ${hostId} and home_id = ${task.homeId}
    `;
    if (!host) throw new Error("Agent session host is outside the task home");
    return { homeId: task.homeId, hostId };
  }
  throw new Error("Unsupported agent session scope");
}

async function buildPrompt(
  task: Exclude<AgentTask, { task: "resume" }>,
  deps: AgentDeps,
): Promise<string> {
  const sql = sqlClient(deps.db);
  if (task.task === "host_capture") {
    const [host] = await sql<{ display_name: string }[]>`
      select display_name from public.hosts
      where id = ${task.hostId} and home_id = ${task.homeId}
    `;
    return `${host?.display_name ?? "The host"} pasted this invitation (locale ${task.locale}): """${task.rawMessage}""". Structure it with capture_invitation and reply with a one-line summary for the host. The application will deliver the private link outside the model transcript.`;
  }
  if (task.task === "guest_submit") {
    const [party] = await sql<{ family_name: string }[]>`
      select p.family_name from public.invitations i join public.parties p on p.id = i.party_id
      where i.id = ${task.invitationId} and i.home_id = ${task.homeId}
    `;
    return `Party ${party?.family_name ?? "guest"} (invitation ${task.invitationId}) chose ${task.stay.join(" to ")}, ${task.adults} adults, ${task.children} children, ${task.pets} pets, arrival ${task.arrivalTime ?? "not given"}, notes: ${task.notes ?? "none"}. Place a hold, then confirm it, and tell the guest what happens next in their language.`;
  }
  if (
    task.task === "guest_change" ||
    (task.task === "guest_reconfirm" && task.answer === "change")
  ) {
    const [visit] = await sql<{ family_name: string }[]>`
      select p.family_name from public.visits v join public.parties p on p.id = v.party_id
      where v.id = ${task.visitId} and v.home_id = ${task.homeId}
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
    join public.parties p on p.id = v.party_id
    where j.id = ${task.jobId} and j.home_id = ${task.homeId}
  `;
  if (!job) throw new Error(`Scheduled job not found: ${task.jobId}`);
  if (job.kind === "reconfirm_chase") {
    return `Visit ${job.visit_id} for ${job.family_name} starts ${job.stay_start}. Write the reconfirmation request to the party with notify (kind 'reconfirm_chase', scheduledJobId '${task.jobId}'); do not change the booking.`;
  }
  return `Visit ${job.visit_id} for ${job.family_name} was not reconfirmed within 24 hours. Tell both hosts with notify (kind 'reconfirm_escalation', scheduledJobId '${task.jobId}', one call per host) what is at stake and what they can do.`;
}
