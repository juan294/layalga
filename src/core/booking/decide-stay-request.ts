import "@/core/server-only";
import { isDeepStrictEqual } from "node:util";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import { configuredScheduler } from "@/agent/scheduler";
import { SystemClock, type Clock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import type { Locale, StayRequestStatus } from "@/core/db/schema";
import type { JobScheduler } from "@/core/reconfirmation/jobs";
import {
  BookingPolicyError,
  RoomOverflowApprovalRequiredError,
  RoomUnavailableError,
  confirmVisitInTransaction,
  createTemporaryHoldInTransaction,
  lockBookingHome,
  syncChaseJob,
  type SchedulingPlan,
} from "./holds";
import { insertCapture } from "./invitations";
import {
  resolvePublicStaySelection,
  type PublicRoomChoice,
} from "./public-stay-search";

type Host = { id: string; homeId: string };
type Answer = "confirm" | "decline";
type Terminal = Exclude<StayRequestStatus, "pending">;
type DecisionStatus = Terminal | "stale" | "conflict" | "not_found";
export interface StayDecisionResult {
  status: DecisionStatus;
  currentStatus: StayRequestStatus | null;
  version: number | null;
  visitId: string | null;
  decidedByHostId: string | null;
  decidedByName: string | null;
  replayed: boolean;
}
interface Receipt {
  status: StayRequestStatus;
  version: number;
  visit_id: string | null;
  decided_by_host_id: string | null;
  decided_by_name: string | null;
}
interface Proposal extends Receipt {
  id: string;
  listing_handle: string;
  requester_id: string;
  arrival: string;
  departure: string;
  nights: number;
  adults: number;
  children: number;
  pets: number;
  room_ids: string[];
  room_terms: PublicRoomChoice[];
  overflow_consent: boolean;
  notes: string;
  requests: string;
  locale: Locale;
  arrival_passed: boolean;
}
function outcome(
  status: DecisionStatus,
  receipt?: Receipt,
  replayed = false,
): StayDecisionResult {
  return {
    status,
    currentStatus: receipt?.status ?? null,
    version: receipt?.version ?? null,
    visitId: receipt?.visit_id ?? null,
    decidedByHostId: receipt?.decided_by_host_id ?? null,
    decidedByName: receipt?.decided_by_name ?? null,
    replayed,
  };
}

async function recordDecision(
  tx: TransactionSql,
  host: Host,
  actorName: string,
  proposal: Proposal,
  status: Terminal,
  now: Date,
  visitId: string | null = null,
) {
  const actor = status === "expired" ? null : host.id;
  const [row] = await tx<
    Receipt[]
  >`update public.stay_requests r set status=${status},version=r.version+1,
    visit_id=${visitId}, decided_by_host_id=${actor},updated_at=${now.toISOString()},
    terminal_at=case when ${status}='expired' then (lower(r.stay)+1)::timestamp at time zone h.timezone
      else ${now.toISOString()}::timestamptz end
    from public.homes h where r.id=${proposal.id} and r.home_id=${host.homeId} and h.id=r.home_id
      and r.version=${proposal.version} and r.status='pending'
    returning r.status,r.version,r.visit_id,r.decided_by_host_id,${actor ? actorName : null}::text as decided_by_name`;
  if (!row)
    throw new Error("The locked stay request changed during the decision");
  if (actor)
    await tx`insert into public.audit_events(home_id,actor,kind,payload)
    values(${host.homeId},'host','stay_request_decided',
      ${JSON.stringify({ requestId: proposal.id, hostId: actor, status, visitId })}::jsonb)`;
  return outcome(status, row);
}

async function bookExactProposal(
  tx: TransactionSql,
  host: Host,
  proposal: Proposal,
  clock: Clock,
) {
  // Room edits can also be made outside the booking workflow. Keep the selected
  // wording/capacities and household rules stable until confirmation commits.
  await tx`select id from public.homes where id=${host.homeId} for share`;
  await tx`select id from public.rooms where home_id=${host.homeId} and id=any(${tx.array(proposal.room_ids)}::uuid[])
    order by id for share`;
  const selected = await resolvePublicStaySelection(
    proposal.listing_handle,
    {
      from: proposal.arrival,
      to: proposal.departure,
      nights: proposal.nights,
      adults: proposal.adults,
      children: proposal.children,
      pets: proposal.pets,
    },
    proposal.room_terms.map((room) => room.ref),
    proposal.overflow_consent,
    tx,
    clock,
  );
  if (
    !selected ||
    selected.homeId !== host.homeId.toLowerCase() ||
    !isDeepStrictEqual(selected.rooms, proposal.room_terms) ||
    !isDeepStrictEqual(selected.roomIds, proposal.room_ids)
  )
    return null;

  // Only the existing verified identity can authorize reuse. A display name or
  // contact address alone cannot grant a party's history to this requester.
  const parties = await tx<{ id: string }[]>`select id from public.parties
    where home_id=${host.homeId} and auth_user_id=${proposal.requester_id} order by id limit 2 for update`;
  const capture = await insertCapture(tx, {
    homeId: host.homeId,
    hostId: host.id,
    returningPartyId: parties.length === 1 ? parties[0]!.id : undefined,
    partyName: proposal.locale === "es" ? "Huésped" : "Guest",
    partyLocale: proposal.locale,
    rawMessage: "",
    now: clock.now(),
  });
  if (parties.length !== 1)
    await tx`update public.parties set auth_user_id=${proposal.requester_id}
    where id=${capture.partyId} and home_id=${host.homeId}`;
  const hold = await createTemporaryHoldInTransaction(
    tx,
    clock,
    {
      invitationId: capture.invitationId,
      stay: [proposal.arrival, proposal.departure],
      adults: proposal.adults,
      children: proposal.children,
      pets: proposal.pets,
      approvedBy: host.id,
      roomIds: selected.roomIds,
      overflowConsent: proposal.overflow_consent,
      guestNotes: proposal.notes,
      specialRequests: proposal.requests ? [proposal.requests] : [],
    },
    { lockHome: false },
  );
  const booked = await confirmVisitInTransaction(
    tx,
    clock,
    hold.visitId,
    host.id,
  );
  await tx`update public.invitations set status='converted' where id=${capture.invitationId}`;
  return booked;
}

export async function decideRequestedStay(
  host: Host,
  requestId: string,
  reviewedVersion: number,
  answer: Answer,
  options: { clock?: Clock; scheduler?: JobScheduler } = {},
): Promise<StayDecisionResult> {
  if (
    ![host?.id, host?.homeId, requestId].every(
      (value) => z.uuid().safeParse(value).success,
    ) ||
    !Number.isSafeInteger(reviewedVersion) ||
    reviewedVersion < 1 ||
    !["confirm", "decline"].includes(answer)
  )
    return outcome("not_found");
  const { sql } = getDatabaseConnection();
  const clock = options.clock ?? new SystemClock();
  const committed = await sql.begin(
    async (
      tx,
    ): Promise<{ result: StayDecisionResult; scheduling?: SchedulingPlan }> => {
      const [actor] = await tx<
        { display_name: string }[]
      >`select display_name from public.hosts where home_id=${host.homeId} and id=${host.id}`;
      if (!actor) return { result: outcome("not_found") };
      await lockBookingHome(tx, host.homeId);
      const now = clock.now();
      const [proposal] = await tx<
        Proposal[]
      >`select r.id,r.status,r.version,r.visit_id,r.decided_by_host_id,
      winner.display_name as decided_by_name,r.listing_handle,r.requester_id,lower(r.stay)::text arrival,
      upper(r.stay)::text departure,upper(r.stay)-lower(r.stay) nights,r.adults,r.children,r.pets,r.room_ids,r.room_terms,
      r.overflow_consent,r.notes,r.requests,r.locale,lower(r.stay)<(${now.toISOString()}::timestamptz at time zone h.timezone)::date arrival_passed
      from public.stay_requests r join public.homes h on h.id=r.home_id
      left join public.hosts winner on winner.id=r.decided_by_host_id
      where r.id=${requestId} and r.home_id=${host.homeId} for update of r`;
      if (!proposal) return { result: outcome("not_found") };
      if (proposal.status !== "pending") {
        const prior = proposal.status;
        if (
          prior === "confirmed" ||
          prior === "declined" ||
          prior === "needs_new_selection"
        ) {
          const sameAnswer =
            answer === (prior === "declined" ? "decline" : "confirm");
          return {
            result: outcome(
              sameAnswer ? prior : "conflict",
              proposal,
              sameAnswer,
            ),
          };
        }
        return { result: outcome(prior, proposal) };
      }
      const record = (status: Terminal, visitId?: string) =>
        recordDecision(
          tx,
          host,
          actor.display_name,
          proposal,
          status,
          now,
          visitId,
        );
      if (proposal.arrival_passed) return { result: await record("expired") };
      if (proposal.version !== reviewedVersion)
        return { result: outcome("stale", proposal) };
      if (answer === "decline") return { result: await record("declined") };
      let booked;
      try {
        booked = await tx.savepoint((savepoint) =>
          bookExactProposal(savepoint, host, proposal, clock),
        );
      } catch (error) {
        if (!(
          error instanceof RoomUnavailableError ||
          error instanceof BookingPolicyError ||
          error instanceof RoomOverflowApprovalRequiredError ||
          (error instanceof Error && "code" in error && error.code === "23P01")
        ))
          throw error;
      }
      if (!booked) return { result: await record("needs_new_selection") };
      return {
        result: await record("confirmed", booked.result.visitId),
        scheduling: booked.scheduling,
      };
    },
  );
  if (committed.scheduling) {
    try {
      await syncChaseJob(
        sql,
        options.scheduler ?? configuredScheduler(),
        committed.scheduling,
      );
    } catch {
      // The durable job remains claimable by the normal tick runner.
      console.warn(
        "External reconfirmation scheduling failed for a committed stay request",
      );
    }
  }
  return committed.result;
}
