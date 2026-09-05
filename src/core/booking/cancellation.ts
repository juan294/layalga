import { CancellationChangedError } from "./cancellation-error";
import { sqlClient, type DatabaseClient } from "@/core/db/client";
import {
  noopJobScheduler,
  type JobScheduler,
} from "@/core/reconfirmation/jobs";

import { cancelVisitInTransaction } from "./holds";

export interface CancellationInput {
  homeId: string;
  invitationId: string;
  actor: { kind: "host"; hostId: string } | { kind: "guest"; partyId: string };
  expectedVisitId: string | null;
  expectedStay: readonly [string, string] | null;
}

/** Human-confirmed invitation withdrawal also handles a request interrupted
 * before its first hold. Caller identity comes from the authenticated route. */
export async function withdrawInvitation(
  database: DatabaseClient,
  input: CancellationInput,
  scheduler: JobScheduler = noopJobScheduler,
): Promise<void> {
  const sql = sqlClient(database);
  const refs = await sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtextextended(${input.homeId}::text, 0))`;
    const [invitation] = await transaction<
      { party_id: string; status: string }[]
    >`
      select party_id, status from public.invitations
      where id = ${input.invitationId} and home_id = ${input.homeId} for update
    `;
    if (!invitation) throw new Error("Invitation is outside your household");
    if (input.actor.kind === "guest") {
      if (invitation.party_id !== input.actor.partyId)
        throw new Error("Invitation is outside your access");
    } else {
      const [host] =
        await transaction`select id from public.hosts where id = ${input.actor.hostId} and home_id = ${input.homeId}`;
      if (!host) throw new Error("Host is outside this household");
    }
    if (invitation.status === "cancelled") return [];
    const visits = await transaction<
      { id: string; start: string; end: string }[]
    >`
      select id, lower(stay)::text as start, upper(stay)::text as end
      from public.visits where invitation_id = ${input.invitationId}
        and home_id = ${input.homeId} and status <> 'cancelled'
      order by created_at desc for update
    `;
    const visit = visits[0];
    if (
      visits.length > 1 ||
      (visit?.id ?? null) !== input.expectedVisitId ||
      (visit &&
        (visit.start !== input.expectedStay?.[0] ||
          visit.end !== input.expectedStay?.[1]))
    ) {
      throw new CancellationChangedError();
    }
    const externalRefs: string[] = [];
    if (visit)
      externalRefs.push(
        ...(await cancelVisitInTransaction(transaction, visit.id)),
      );
    await transaction`
      update public.invitations set status = 'cancelled', link_token_revoked_at = now()
      where id = ${input.invitationId} and home_id = ${input.homeId}
    `;
    // A pre-hold decision has no visit_id: the durable invitation session is
    // the canonical association. Preserve the decision's history as cancelled.
    await transaction`
      update public.pending_decisions set status = 'cancelled', application_error = null
      where home_id = ${input.homeId}
        and (agent_session_id = ${`inv_${input.invitationId}`} or visit_id = ${visit?.id ?? null})
        and (status = 'pending' or (status in ('approved', 'declined') and not exists (
          select 1 from public.audit_events ae where ae.kind = 'decision_applied'
            and ae.payload->>'pendingDecisionId' = pending_decisions.id::text
        )))
    `;
    await transaction`
      update public.runs set status = 'failed', finished_at = now(),
        queue_claim_token = null, queue_claimed_at = null,
        last_error = 'Request withdrawn by its guest or host',
        result = '{"code":"request_cancelled","summary":"The request was cancelled. No further booking or follow-up will run."}'::jsonb
      where home_id = ${input.homeId} and status in ('queued', 'running', 'interrupted')
        and (session_id = ${`inv_${input.invitationId}`} or payload->>'visitId' = ${visit?.id ?? null}
          or exists (select 1 from public.scheduled_jobs job
            where job.home_id = ${input.homeId} and job.visit_id = ${visit?.id ?? null}
              and (job.id::text = runs.payload->>'jobId' or runs.session_id = 'tick_' || job.id::text)))
    `;
    await transaction`
      insert into public.audit_events (home_id, actor, kind, payload)
      values (${input.homeId}, ${input.actor.kind}, 'invitation_cancelled',
        ${JSON.stringify({
          invitationId: input.invitationId,
          visitId: visit?.id ?? null,
          ...(input.actor.kind === "host"
            ? { hostId: input.actor.hostId }
            : { partyId: input.actor.partyId }),
        })}::jsonb)
    `;
    return externalRefs;
  });
  // Database cancellation is authoritative even if deleting a remote schedule
  // fails: the tick runner cannot claim a cancelled job.
  for (const ref of refs) {
    try {
      await scheduler.cancel(ref);
    } catch (error) {
      console.error("[CANCEL_SCHEDULE_FAILED]", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}
