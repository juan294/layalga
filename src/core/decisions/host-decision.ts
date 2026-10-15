import { sqlClient, type DatabaseClient } from "../db/client";

export interface HostDecisionInput {
  decisionId: string;
  homeId: string;
  hostId: string;
  approved: boolean;
  note?: string;
}

export interface RecordedHostDecision {
  agentSessionId: string;
  interruptId: string;
}

/**
 * Records a host's answer to a pending decision and returns the interrupted
 * session to resume. The same host may retry an identical, not yet applied
 * answer; any other change to a decided row returns null.
 */
export async function recordHostDecision(
  database: DatabaseClient,
  { decisionId, homeId, hostId, approved, note }: HostDecisionInput,
): Promise<RecordedHostDecision | null> {
  const sql = sqlClient(database);
  const status = approved ? "approved" : "declined";
  const [decision] = await sql<
    { agent_session_id: string; interrupt_id: string }[]
  >`
    update public.pending_decisions
    set status = ${status},
      decided_by_host_id = ${hostId},
      decided_at = ${new Date().toISOString()},
      note = ${note ?? null},
      application_error = null
    where id = ${decisionId}
      and home_id = ${homeId}
      and (
        status = 'pending'
        or (
          status = ${status}
          and applied_run_id is null
          and decided_by_host_id = ${hostId}
          and note is not distinct from ${note ?? null}
        )
      )
    returning agent_session_id, interrupt_id
  `;
  return decision
    ? {
        agentSessionId: decision.agent_session_id,
        interruptId: decision.interrupt_id,
      }
    : null;
}
