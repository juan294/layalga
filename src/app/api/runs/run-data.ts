import { getDatabaseConnection, sqlClient } from "@/core/db/client";
import { findInvitationByToken } from "@/core/booking/invitations";
import type { ExecutionRuntime } from "@/agent/deps";
import { parseStoredRunResult } from "@/agent/task";
import { getCurrentGuestInvitation } from "@/lib/auth/current-guest";
import { getCurrentHost } from "@/lib/auth/current-host";
import { objectValue } from "@/lib/json-object";

export type RunStatus =
  "queued" | "running" | "completed" | "interrupted" | "failed";

export interface RunTimelineEvent {
  at: string;
  kind: "tool_call" | "policy_verdict" | "decision_applied";
  name?: string;
  decision?: "allow" | "deny" | "interrupt";
}

export interface RunSnapshot {
  id: string;
  status: RunStatus;
  summary: string | null;
  finishedAt: string | null;
  executedOn?: ExecutionRuntime;
  /** Token usage is not recorded yet; reserved for a future run result field. */
  usage?: { tokens: number; tools: number };
  events: RunTimelineEvent[];
}

const TIMELINE_KINDS = new Set([
  "tool_call",
  "policy_verdict",
  "decision_applied",
]);
const POLICY_DECISIONS = new Set(["allow", "deny", "interrupt"]);

/**
 * Maps an audit_events row to a timeline event, carrying only kind,
 * timestamp, tool name, and policy decision. Never includes
 * `payload.reason`, room ids, or any other free text.
 */
function toTimelineEvent(row: {
  kind: string;
  payload: unknown;
  created_at: Date | string;
}): RunTimelineEvent | null {
  if (!TIMELINE_KINDS.has(row.kind)) return null;
  const at = new Date(row.created_at).toISOString();
  const payload = objectValue(row.payload);

  if (row.kind === "tool_call") {
    const name = typeof payload?.name === "string" ? payload.name : undefined;
    return { at, kind: "tool_call", name };
  }
  if (row.kind === "policy_verdict") {
    const decision =
      typeof payload?.decision === "string" &&
      POLICY_DECISIONS.has(payload.decision)
        ? (payload.decision as RunTimelineEvent["decision"])
        : undefined;
    return { at, kind: "policy_verdict", decision };
  }
  return { at, kind: "decision_applied" };
}

export async function getAuthorizedRunSnapshot(
  id: string,
  token?: string,
): Promise<RunSnapshot | null> {
  const sql = sqlClient(getDatabaseConnection().db);
  const rows = await sql<
    {
      id: string;
      home_id: string;
      session_id: string;
      status: RunStatus;
      result: unknown;
      finished_at: Date | string | null;
      event_kind: string | null;
      event_payload: unknown;
      event_created_at: Date | string | null;
    }[]
  >`
    select
      r.id, r.home_id, r.session_id, r.status, r.result, r.finished_at,
      ae.kind as event_kind, ae.payload as event_payload,
      ae.created_at as event_created_at
    from public.runs r
    left join public.audit_events ae
      on ae.run_id = r.id
     and ae.home_id = r.home_id
     and ae.kind in ('tool_call', 'policy_verdict', 'decision_applied')
    where r.id = ${id}
    order by ae.created_at, ae.id
  `;
  const [run] = rows;
  if (!run) return null;

  let authorized = false;
  if (token) {
    const invitation = await findInvitationByToken(
      getDatabaseConnection().db,
      token,
    );
    if (
      invitation &&
      invitation.homeId === run.home_id &&
      run.session_id === `inv_${invitation.id}`
    ) {
      authorized = true;
    }
  }

  if (!authorized) {
    const host = await getCurrentHost();
    authorized = host?.homeId === run.home_id;
  }
  if (!authorized) {
    const guest = await getCurrentGuestInvitation();
    authorized =
      guest?.homeId === run.home_id &&
      run.session_id === `inv_${guest.invitationId}`;
  }
  if (!authorized) return null;

  const events = rows
    .filter((row) => row.event_kind !== null && row.event_created_at !== null)
    .map((row) =>
      toTimelineEvent({
        kind: row.event_kind as string,
        payload: row.event_payload,
        created_at: row.event_created_at as Date | string,
      }),
    )
    .filter((event): event is RunTimelineEvent => event !== null);

  const stored = parseStoredRunResult(run.result);
  return {
    id: run.id,
    status: run.status,
    summary: stored.summary ?? null,
    finishedAt: run.finished_at
      ? new Date(run.finished_at).toISOString()
      : null,
    executedOn: stored.executedOn,
    events,
  };
}
