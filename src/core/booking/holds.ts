import { createHash } from "node:crypto";

import type { TransactionSql } from "postgres";

import type { Clock } from "../clock";
import { sqlClient, type DatabaseClient } from "../db/client";
import {
  evaluateOverlap,
  type HouseState,
  type PolicyVerdict,
  type Stay,
  type VisitDraft,
  type VisitStatus,
} from "../policy/evaluate-overlap";
import { reconfirmationChaseTime } from "../reconfirmation/state-machine";
import {
  noopJobScheduler,
  scheduleJobs,
  type JobScheduler,
  type ScheduledJobRequest,
} from "../reconfirmation/jobs";

type DateStay = readonly [start: string, end: string];

export interface CreateTemporaryHoldInput {
  invitationId: string;
  stay: DateStay;
  adults: number;
  children?: number;
  pets?: number;
  specialRequests?: readonly string[];
  approvedBy?: string;
}

export interface HoldOptions {
  /** Test seam that proves the database exclusion constraint is sufficient. */
  lockHome?: boolean;
}

export interface VisitResult {
  visitId: string;
  allocation: { id: string; name: string; beds: number }[];
  status: VisitStatus;
}

export interface RescheduleVisitInput {
  visitId: string;
  stay: DateStay;
  adults?: number;
  children?: number;
  pets?: number;
  specialRequests?: readonly string[];
  approvedBy?: string;
}

export class RoomUnavailableError extends Error {
  constructor(
    message = "No room allocation is available for this stay",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RoomUnavailableError";
  }
}

export class BookingPolicyError extends Error {
  constructor(readonly verdict: PolicyVerdict) {
    super(`Booking denied by the ${verdict.reason ?? "unknown"} rule`);
    this.name = "BookingPolicyError";
  }
}

interface InvitationContext {
  home_id: string;
  party_id: string;
}

interface HomeRow {
  id: string;
  timezone: string;
  pets_together_allowed: boolean;
  max_families_with_children: number;
}

interface VisitRow {
  id: string;
  home_id: string;
  party_id: string;
  invitation_id: string;
  stay_start: string;
  stay_end: string;
  adults: number;
  children: number;
  pets: number;
  special_requests: string[];
  approval_stay_hash: string | null;
  status: VisitStatus;
  hold_expires_at: Date | string | null;
}

export async function createTemporaryHold(
  database: DatabaseClient,
  clock: Clock,
  input: CreateTemporaryHoldInput,
  options: HoldOptions = {},
): Promise<VisitResult> {
  validateParty(input);
  validateStay(input.stay);
  const client = sqlClient(database);

  try {
    return await client.begin(async (transaction) => {
      const invitations = await transaction<InvitationContext[]>`
        select home_id, party_id
        from public.invitations
        where id = ${input.invitationId}
          and status <> 'cancelled'
      `;
      const invitation = invitations[0];
      if (!invitation)
        throw new Error(`Invitation not found: ${input.invitationId}`);

      const home = await loadHome(
        transaction,
        invitation.home_id,
        options.lockHome !== false,
      );
      await expireHomeHolds(transaction, invitation.home_id, clock.now());
      const draft = toDraft(input);
      await assertHostInHome(transaction, input.approvedBy, invitation.home_id);
      const state = await loadHouseState(transaction, home, draft.stay);
      const verdict = evaluateOverlap(draft, state);
      assertBookable(verdict);

      const now = clock.now();
      const holdExpiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1_000);
      const approvalHash = input.approvedBy ? stayApprovalHash(draft) : null;
      const visits = await transaction<{ id: string }[]>`
        insert into public.visits (
          home_id,
          party_id,
          invitation_id,
          stay,
          adults,
          children,
          pets,
          special_requests,
          status,
          hold_expires_at,
          approval_stay_hash
        )
        values (
          ${invitation.home_id},
          ${invitation.party_id},
          ${input.invitationId},
          daterange(${input.stay[0]}::date, ${input.stay[1]}::date, '[)'),
          ${input.adults},
          ${input.children ?? 0},
          ${input.pets ?? 0},
          ${transaction.array([...(input.specialRequests ?? [])])},
          'hold',
          ${holdExpiresAt.toISOString()},
          ${approvalHash}
        )
        returning id
      `;
      const visitId = visits[0]?.id;
      if (!visitId) throw new Error("Failed to create the temporary hold");

      await insertVisitRooms(
        transaction,
        visitId,
        invitation.home_id,
        input.stay,
        verdict.allocation,
      );
      return { visitId, allocation: verdict.allocation, status: "hold" };
    });
  } catch (error) {
    throw mapRoomConflict(error, options.lockHome === false);
  }
}

export async function confirmVisit(
  database: DatabaseClient,
  clock: Clock,
  visitId: string,
  approvedBy?: string,
  scheduler: JobScheduler = noopJobScheduler,
): Promise<VisitResult> {
  const client = sqlClient(database);

  try {
    const { result, scheduling } = await client.begin(async (transaction) => {
      const visit = await loadVisitWithHomeLock(transaction, visitId);
      if (visit.status === "cancelled")
        throw new Error("A cancelled visit cannot be confirmed");
      assertActiveHold(visit, clock.now());

      const home = await loadHome(transaction, visit.home_id, false);
      const expired = await expireHomeHolds(
        transaction,
        visit.home_id,
        clock.now(),
      );
      const draft = visitDraft(visit);
      await assertHostInHome(transaction, approvedBy, visit.home_id);
      const verdict = evaluateOverlap(
        draft,
        await loadHouseState(transaction, home, draft.stay),
      );
      assertBookable(verdict);

      const approvalHash = approvedBy ? stayApprovalHash(draft) : null;
      const now = clock.now();
      await transaction`
        update public.visits
        set status = 'confirmed',
            confirmed_at = ${now.toISOString()},
            hold_expires_at = null,
            approval_stay_hash = coalesce(${approvalHash}, approval_stay_hash)
        where id = ${visitId}
      `;
      const scheduling = await replaceChaseJob(
        transaction,
        visit,
        home.timezone,
        now,
      );
      scheduling.cancelledExternalRefs.push(...expired.externalRefs);

      return {
        result: {
          visitId,
          allocation: verdict.allocation,
          status: "confirmed" as const,
        },
        scheduling,
      };
    });
    await syncChaseJob(database, scheduler, scheduling);
    return result;
  } catch (error) {
    throw mapRoomConflict(error);
  }
}

export async function cancelVisit(
  database: DatabaseClient,
  visitId: string,
  scheduler: JobScheduler = noopJobScheduler,
): Promise<void> {
  const client = sqlClient(database);
  const cancelledExternalRefs = await client.begin(async (transaction) => {
    const visit = await loadVisitWithHomeLock(transaction, visitId);
    if (visit.status === "cancelled") return [];

    await transaction`delete from public.visit_rooms where visit_id = ${visitId}`;
    const externalRefs = await cancelOpenVisitJobs(transaction, visitId);
    await transaction`
      update public.visits
      set status = 'cancelled', hold_expires_at = null
      where id = ${visitId}
    `;
    return externalRefs;
  });
  for (const externalRef of cancelledExternalRefs) {
    await scheduler.cancel(externalRef);
  }
}

export async function expireTemporaryHolds(
  database: DatabaseClient,
  clock: Clock,
  scheduler: JobScheduler = noopJobScheduler,
  homeId?: string,
): Promise<number> {
  const client = sqlClient(database);
  const homes = await client<{ home_id: string }[]>`
    select distinct home_id
    from public.visits
    where status = 'hold'
      and hold_expires_at <= ${clock.now().toISOString()}
      and (${homeId ?? null}::uuid is null or home_id = ${homeId ?? null})
      and (
        ${homeId ?? null}::uuid is not null
        or exists (
          select 1 from public.homes
          where homes.id = visits.home_id and homes.demo = false
        )
      )
    order by home_id
  `;
  let expired = 0;
  const cancelledExternalRefs: string[] = [];
  for (const home of homes) {
    const result = await client.begin(async (transaction) => {
      await loadHome(transaction, home.home_id, true);
      return expireHomeHolds(transaction, home.home_id, clock.now());
    });
    expired += result.count;
    cancelledExternalRefs.push(...result.externalRefs);
  }
  for (const externalRef of cancelledExternalRefs) {
    await scheduler.cancel(externalRef);
  }
  return expired;
}

export async function rescheduleVisit(
  database: DatabaseClient,
  clock: Clock,
  input: RescheduleVisitInput,
  scheduler: JobScheduler = noopJobScheduler,
): Promise<VisitResult> {
  validateStay(input.stay);
  const client = sqlClient(database);

  try {
    const { result, scheduling } = await client.begin(async (transaction) => {
      const current = await loadVisitWithHomeLock(transaction, input.visitId);
      if (current.status === "cancelled")
        throw new Error("A cancelled visit cannot be rescheduled");
      assertActiveHold(current, clock.now());

      const home = await loadHome(transaction, current.home_id, false);
      const expired = await expireHomeHolds(
        transaction,
        current.home_id,
        clock.now(),
      );
      const draft: VisitDraft = {
        visitId: current.id,
        stay: input.stay,
        adults: input.adults ?? current.adults,
        children: input.children ?? current.children,
        pets: input.pets ?? current.pets,
        specialRequests: input.specialRequests ?? current.special_requests,
      };
      validateParty(draft);
      await assertHostInHome(transaction, input.approvedBy, current.home_id);
      const verdict = evaluateOverlap(
        draft,
        await loadHouseState(transaction, home, draft.stay),
      );
      assertBookable(verdict);
      const draftApprovalHash = stayApprovalHash(draft);
      const approvalHash = input.approvedBy
        ? draftApprovalHash
        : current.approval_stay_hash === draftApprovalHash
          ? current.approval_stay_hash
          : null;

      await transaction`delete from public.visit_rooms where visit_id = ${current.id}`;
      await transaction`
        update public.visits
        set stay = daterange(${input.stay[0]}::date, ${input.stay[1]}::date, '[)'),
            adults = ${draft.adults},
            children = ${draft.children},
            pets = ${draft.pets},
            special_requests = ${transaction.array([...draft.specialRequests])},
            approval_stay_hash = ${approvalHash},
            status = 'confirmed',
            confirmed_at = coalesce(confirmed_at, ${clock.now().toISOString()}),
            hold_expires_at = null,
            reconfirm_requested_at = null,
            reconfirmed_at = null,
            escalated_at = null
        where id = ${current.id}
      `;
      await insertVisitRooms(
        transaction,
        current.id,
        current.home_id,
        input.stay,
        verdict.allocation,
      );

      const cancelledExternalRefs = await cancelOpenVisitJobs(
        transaction,
        current.id,
      );
      const scheduling = await replaceChaseJob(
        transaction,
        {
          id: current.id,
          home_id: current.home_id,
          stay_start: input.stay[0],
        },
        home.timezone,
        clock.now(),
      );
      scheduling.cancelledExternalRefs.push(...cancelledExternalRefs);
      scheduling.cancelledExternalRefs.push(...expired.externalRefs);

      return {
        result: {
          visitId: current.id,
          allocation: verdict.allocation,
          status: "confirmed" as const,
        },
        scheduling,
      };
    });
    await syncChaseJob(database, scheduler, scheduling);
    return result;
  } catch (error) {
    throw mapRoomConflict(error);
  }
}

export function stayApprovalHash(draft: VisitDraft): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        stay: draft.stay.map((value) =>
          value instanceof Date ? value.toISOString() : value,
        ),
        adults: draft.adults,
        children: draft.children,
        pets: draft.pets,
        specialRequests: [...draft.specialRequests],
      }),
    )
    .digest("hex");
}

async function loadHome(
  transaction: TransactionSql,
  homeId: string,
  lock: boolean,
): Promise<HomeRow> {
  const rows = lock
    ? await transaction<HomeRow[]>`
        select id, timezone, pets_together_allowed, max_families_with_children
        from public.homes
        where id = ${homeId}
        for update
      `
    : await transaction<HomeRow[]>`
        select id, timezone, pets_together_allowed, max_families_with_children
        from public.homes
        where id = ${homeId}
      `;
  const home = rows[0];
  if (!home) throw new Error(`Home not found: ${homeId}`);
  return home;
}

async function expireHomeHolds(
  transaction: TransactionSql,
  homeId: string,
  now: Date,
): Promise<{ count: number; externalRefs: string[] }> {
  const expired = await transaction<{ id: string }[]>`
    select id
    from public.visits
    where home_id = ${homeId}
      and status = 'hold'
      and hold_expires_at <= ${now.toISOString()}
    order by id
    for update
  `;
  const externalRefs: string[] = [];
  for (const visit of expired) {
    await transaction`delete from public.visit_rooms where visit_id = ${visit.id}`;
    externalRefs.push(...(await cancelOpenVisitJobs(transaction, visit.id)));
    await transaction`
      update public.visits
      set status = 'cancelled', hold_expires_at = null
      where id = ${visit.id} and status = 'hold'
    `;
  }
  return { count: expired.length, externalRefs };
}

function assertActiveHold(visit: VisitRow, now: Date): void {
  if (
    visit.status === "hold" &&
    visit.hold_expires_at !== null &&
    new Date(visit.hold_expires_at).getTime() <= now.getTime()
  ) {
    throw new Error("An expired hold cannot be confirmed or rescheduled");
  }
}

async function assertHostInHome(
  transaction: TransactionSql,
  hostId: string | undefined,
  homeId: string,
): Promise<void> {
  if (!hostId) return;
  const [host] = await transaction<{ id: string }[]>`
    select id from public.hosts where id = ${hostId} and home_id = ${homeId}
  `;
  if (!host)
    throw new Error("Approving host does not belong to the visit home");
}

async function loadVisitWithHomeLock(
  transaction: TransactionSql,
  visitId: string,
): Promise<VisitRow> {
  const visits = await loadVisit(transaction, visitId, false);
  const initial = visits[0];
  if (!initial) throw new Error(`Visit not found: ${visitId}`);

  await loadHome(transaction, initial.home_id, true);
  const locked = await loadVisit(transaction, visitId, true);
  const visit = locked[0];
  if (!visit) throw new Error(`Visit not found: ${visitId}`);
  return visit;
}

function loadVisit(
  transaction: TransactionSql,
  visitId: string,
  lock: boolean,
) {
  return lock
    ? transaction<VisitRow[]>`
        select
          id,
          home_id,
          party_id,
          invitation_id,
          lower(stay)::text as stay_start,
          upper(stay)::text as stay_end,
          adults,
          children,
          pets,
          special_requests,
          approval_stay_hash,
          status,
          hold_expires_at
        from public.visits
        where id = ${visitId}
        for update
      `
    : transaction<VisitRow[]>`
        select
          id,
          home_id,
          party_id,
          invitation_id,
          lower(stay)::text as stay_start,
          upper(stay)::text as stay_end,
          adults,
          children,
          pets,
          special_requests,
          approval_stay_hash,
          status,
          hold_expires_at
        from public.visits
        where id = ${visitId}
      `;
}

async function loadHouseState(
  transaction: TransactionSql,
  home: HomeRow,
  stay: Stay,
): Promise<HouseState> {
  const rooms = await transaction<{ id: string; name: string; beds: number }[]>`
    select id, name, beds
    from public.rooms
    where home_id = ${home.id}
    order by created_at, id
  `;
  const visits = await transaction<
    {
      id: string;
      stay_start: string;
      stay_end: string;
      adults: number;
      children: number;
      pets: number;
      status: VisitStatus;
      room_ids: string[];
    }[]
  >`
    select
      v.id,
      lower(v.stay)::text as stay_start,
      upper(v.stay)::text as stay_end,
      v.adults,
      v.children,
      v.pets,
      v.status,
      coalesce(
        array_agg(vr.room_id::text) filter (where vr.room_id is not null),
        '{}'::text[]
      ) as room_ids
    from public.visits v
    left join public.visit_rooms vr on vr.visit_id = v.id
    where v.home_id = ${home.id}
      and v.status in ('hold', 'confirmed', 'reconfirm_pending', 'reconfirmed', 'escalated')
      and v.stay && daterange(${dateBoundary(stay[0])}::date, ${dateBoundary(stay[1])}::date, '[)')
    group by v.id
  `;

  return {
    home: {
      petsTogetherAllowed: home.pets_together_allowed,
      maxFamiliesWithChildren: home.max_families_with_children,
    },
    rooms,
    visits: visits.map((visit) => ({
      id: visit.id,
      stay: [visit.stay_start, visit.stay_end],
      adults: visit.adults,
      children: visit.children,
      pets: visit.pets,
      status: visit.status,
      roomIds: visit.room_ids,
    })),
  };
}

async function insertVisitRooms(
  transaction: TransactionSql,
  visitId: string,
  homeId: string,
  stay: DateStay,
  allocation: readonly { id: string }[],
): Promise<void> {
  for (const room of allocation) {
    await transaction`
      insert into public.visit_rooms (visit_id, room_id, home_id, stay)
      values (
        ${visitId},
        ${room.id},
        ${homeId},
        daterange(${stay[0]}::date, ${stay[1]}::date, '[)')
      )
    `;
  }
}

async function cancelOpenVisitJobs(
  transaction: TransactionSql,
  visitId: string,
): Promise<string[]> {
  const cancelled = await transaction<{ external_ref: string | null }[]>`
    update public.scheduled_jobs
    set status = 'cancelled', claim_token = null, claimed_at = null
    where visit_id = ${visitId}
      and status in ('scheduled', 'running')
    returning external_ref
  `;
  return cancelled.flatMap(({ external_ref: ref }) => (ref ? [ref] : []));
}

async function replaceChaseJob(
  transaction: TransactionSql,
  visit: Pick<VisitRow, "id" | "home_id" | "stay_start">,
  timezone: string,
  now: Date,
): Promise<{
  cancelledExternalRefs: string[];
  request: ScheduledJobRequest;
  visitId: string;
}> {
  const cancelled = await transaction<{ external_ref: string | null }[]>`
    update public.scheduled_jobs
    set status = 'cancelled', claim_token = null, claimed_at = null
    where visit_id = ${visit.id}
      and kind = 'reconfirm_chase'
      and status in ('scheduled', 'running')
    returning external_ref
  `;
  const chaseAt = reconfirmationChaseTime(visit.stay_start, timezone);
  const dueAt = chaseAt > now ? chaseAt : now;
  const [job] = await transaction<{ id: string }[]>`
    insert into public.scheduled_jobs (home_id, visit_id, kind, due_at, status)
    values (
      ${visit.home_id},
      ${visit.id},
      'reconfirm_chase',
      ${dueAt.toISOString()},
      'scheduled'
    )
    returning id
  `;
  if (!job) throw new Error("Failed to persist reconfirmation chase job");
  return {
    cancelledExternalRefs: cancelled.flatMap(({ external_ref: ref }) =>
      ref ? [ref] : [],
    ),
    request: {
      id: job.id,
      homeId: visit.home_id,
      kind: "reconfirm_chase",
      dueAt,
    },
    visitId: visit.id,
  };
}

async function syncChaseJob(
  database: DatabaseClient,
  scheduler: JobScheduler,
  scheduling: Awaited<ReturnType<typeof replaceChaseJob>>,
): Promise<void> {
  for (const externalRef of scheduling.cancelledExternalRefs) {
    await scheduler.cancel(externalRef);
  }
  await scheduleJobs(database, scheduler, [
    {
      type: "create",
      homeId: scheduling.request.homeId,
      visitId: scheduling.visitId,
      kind: scheduling.request.kind,
      dueAt: scheduling.request.dueAt,
    },
  ]);
}

function toDraft(input: CreateTemporaryHoldInput): VisitDraft {
  return {
    stay: input.stay,
    adults: input.adults,
    children: input.children ?? 0,
    pets: input.pets ?? 0,
    specialRequests: input.specialRequests ?? [],
  };
}

function visitDraft(visit: VisitRow): VisitDraft {
  return {
    visitId: visit.id,
    stay: [visit.stay_start, visit.stay_end],
    adults: visit.adults,
    children: visit.children,
    pets: visit.pets,
    specialRequests: visit.special_requests,
  };
}

function assertBookable(verdict: PolicyVerdict): void {
  if (verdict.decision !== "deny") return;
  if (verdict.reason === "beds") throw new RoomUnavailableError();
  throw new BookingPolicyError(verdict);
}

function mapRoomConflict(error: unknown, noLockProbe = false): unknown {
  if (
    isPostgresError(error, "23P01") ||
    (noLockProbe && isPostgresError(error, "40P01"))
  ) {
    return new RoomUnavailableError(
      "The selected room was taken concurrently",
      { cause: error },
    );
  }
  return error;
}

function isPostgresError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function validateParty(input: {
  adults: number;
  children?: number;
  pets?: number;
}): void {
  const values = [input.adults, input.children ?? 0, input.pets ?? 0];
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new RangeError("Party counts must be non-negative integers");
  }
  if ((input.adults ?? 0) + (input.children ?? 0) === 0) {
    throw new RangeError("A visit must include at least one person");
  }
}

function validateStay(stay: DateStay): void {
  const start = Date.parse(`${stay[0]}T00:00:00.000Z`);
  const end = Date.parse(`${stay[1]}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new RangeError(
      "Stay must be a valid, non-empty half-open date range",
    );
  }
}

function dateBoundary(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}
