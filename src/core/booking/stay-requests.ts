import "@/core/server-only";
import { lockBookingHome } from "./holds";
import { createHash } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { getDatabaseConnection } from "@/core/db/client";
import type {
  Locale,
  StayRange,
  StayRequestStatus,
  VisitStatus,
} from "@/core/db/schema";
import {
  resolvePublicStaySelection,
  type PublicRoomChoice,
} from "./public-stay-search";
import { stayRequestInput, type StayRequestInput } from "./stay-requests-input";

export type { StayRequestInput, StayRequestStatus };
export interface StayRequestReceipt {
  id: string;
  handle: string;
  displayName: string;
  stay: StayRange;
  adults: number;
  children: number;
  pets: number;
  rooms: PublicRoomChoice[];
  overflowConsent: boolean;
  notes: string;
  requests: string;
  locale: Locale;
  status: StayRequestStatus;
  version: number;
  visitId: string | null;
  visitStatus: VisitStatus | null;
  createdAt: string;
}
export interface HostStayRequestReceipt extends StayRequestReceipt {
  requesterEmail: string;
}
type SubmitOutcome =
  | { status: "pending"; requestId: string }
  | { status: "replayed" | "conflict"; requestId: string }
  | { status: "invalid" | "stale" | "limit" };
type Host = { id: string; homeId: string };
type Reader =
  | { userId: string; id?: string; handle?: string }
  | { host: Host; id?: string };
const uuid = z.uuid();

function pendingLimit() {
  const value = Number(process.env.STAY_REQUEST_PENDING_LIMIT ?? 3);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("STAY_REQUEST_PENDING_LIMIT must be a positive integer");
  return value;
}

// Reuse the read authorization for any state change caused by that read.
function scope(tx: TransactionSql, reader: Reader) {
  if ("host" in reader)
    return tx`r.home_id=${reader.host.homeId} and exists(
    select 1 from public.hosts h where h.id=${reader.host.id} and h.home_id=r.home_id)
    ${reader.id ? tx`and r.id=${reader.id}` : tx``}`;
  return tx`r.requester_id=${reader.userId}
    ${reader.id ? tx`and r.id=${reader.id}` : tx``}
    ${reader.handle ? tx`and r.listing_handle=${reader.handle}` : tx``}`;
}
async function expirePending(tx: TransactionSql, reader: Reader) {
  await tx`update public.stay_requests r
    set status='expired',version=version+1,updated_at=now(),
        terminal_at=(lower(r.stay)+1)::timestamp at time zone home.timezone
    from public.homes home where r.home_id=home.id and r.status='pending'
      and lower(r.stay)<(now() at time zone home.timezone)::date and ${scope(tx, reader)}`;
}

function payloadHash(proposal: StayRequestInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({ ...proposal, roomRefs: [...proposal.roomRefs].sort() }),
    )
    .digest("hex");
}
async function replay(
  sql: Sql | TransactionSql,
  userId: string,
  proposal: StayRequestInput,
  fingerprint: string,
) {
  const [existing] = await sql<{ id: string; payload_hash: string }[]>`
    select id,payload_hash from public.stay_requests where requester_id=${userId}
    and listing_handle=${proposal.handle} and idempotency_key=${proposal.idempotencyKey}`;
  if (!existing) return null;
  return {
    status: existing.payload_hash === fingerprint ? "replayed" : "conflict",
    requestId: existing.id,
  } as const;
}

export async function findSubmittedStayRequest(
  userId: string,
  input: StayRequestInput,
) {
  const parsed = stayRequestInput.safeParse(input);
  if (!parsed.success || !uuid.safeParse(userId).success) return null;
  return replay(
    getDatabaseConnection().sql,
    userId,
    parsed.data,
    payloadHash(parsed.data),
  );
}

export async function submitStayRequest(
  requester: { userId: string; email: string },
  input: StayRequestInput,
): Promise<SubmitOutcome> {
  const parsed = stayRequestInput.safeParse(input);
  if (
    !parsed.success ||
    !uuid.safeParse(requester?.userId).success ||
    !z.email().max(320).safeParse(requester.email).success
  )
    return { status: "invalid" };
  const proposal = parsed.data;
  const userId = requester.userId.toLowerCase();
  const fingerprint = payloadHash(proposal);
  return getDatabaseConnection().sql.begin(async (tx) => {
    // Different keys for the same user/home share the cap. Separate users
    // can continue submitting concurrently without reserving any rooms.
    await tx`select pg_advisory_xact_lock(hashtextextended(${"stay-request/" + proposal.handle + "/" + userId},0))`;
    const existing = await replay(tx, userId, proposal, fingerprint);
    if (existing) return existing;

    const reader = { userId, handle: proposal.handle };
    await expirePending(tx, reader);
    const [pending] = await tx<
      { count: number }[]
    >`select count(*)::int as count from public.stay_requests r
      where ${scope(tx, reader)} and status='pending'`;
    if (pending!.count >= pendingLimit()) return { status: "limit" } as const;
    const selected = await resolvePublicStaySelection(
      proposal.handle,
      proposal.criteria,
      proposal.roomRefs,
      proposal.overflowConsent,
      tx,
    );
    if (!selected) return { status: "stale" } as const;
    const { from, to, adults, children, pets } = proposal.criteria;
    const [row] = await tx<{ id: string }[]>`insert into public.stay_requests(
      home_id,listing_handle,display_name,requester_id,requester_email,idempotency_key,payload_hash,stay,
      adults,children,pets,room_ids,room_terms,overflow_consent,notes,requests,locale)
      values (${selected.homeId},${proposal.handle},${selected.displayName},${requester.userId},${requester.email},
        ${proposal.idempotencyKey},${fingerprint},daterange(${from}::date,${to}::date,'[)'),
        ${adults},${children},${pets},${tx.array(selected.roomIds)}::uuid[],${JSON.stringify(selected.rooms)}::jsonb,
        ${proposal.overflowConsent},${proposal.notes},${proposal.requests},${proposal.locale}) returning id`;
    return { status: "pending", requestId: row!.id } as const;
  });
}

type ReceiptRow = Omit<StayRequestReceipt, "createdAt" | "stay"> & {
  checkIn: string;
  checkout: string;
  createdAt: Date | string;
  requesterEmail: string | null;
};

async function selectReceipts(tx: TransactionSql, reader: Reader) {
  return tx<
    ReceiptRow[]
  >`select r.id,r.listing_handle as handle,r.display_name as "displayName",
      lower(coalesce(v.stay,r.stay))::text as "checkIn",upper(coalesce(v.stay,r.stay))::text as checkout,
      coalesce(v.adults,r.adults) as adults,coalesce(v.children,r.children) as children,coalesce(v.pets,r.pets) as pets,
      r.room_terms as rooms,r.overflow_consent as "overflowConsent",r.notes,r.requests,
      r.locale,r.status,r.version,r.visit_id as "visitId",v.status as "visitStatus",r.created_at as "createdAt",
      ${"host" in reader ? tx`r.requester_email` : tx`null::text`} as "requesterEmail"
    from public.stay_requests r left join public.visits v on v.id=r.visit_id and v.home_id=r.home_id
    where ${scope(tx, reader)}
      ${"host" in reader ? tx`and r.status='pending'` : tx``}
    order by (r.status='pending') desc,r.created_at desc,r.id`;
}

async function readReceipts(reader: Reader) {
  return getDatabaseConnection().sql.begin(async (tx) => {
    await expirePending(tx, reader);
    return selectReceipts(tx, reader);
  });
}

function receipt(row: ReceiptRow): StayRequestReceipt {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    stay: [row.checkIn, row.checkout],
    adults: row.adults,
    children: row.children,
    pets: row.pets,
    rooms: row.rooms,
    overflowConsent: row.overflowConsent,
    notes: row.notes,
    requests: row.requests,
    locale: row.locale,
    status: row.status,
    version: row.version,
    visitId: row.visitId,
    visitStatus: row.visitStatus,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}
export async function listRequesterStayRequests(
  userId: string,
): Promise<StayRequestReceipt[]> {
  if (!uuid.safeParse(userId).success) return [];
  return (await readReceipts({ userId })).map(receipt);
}
export async function getRequesterStayRequest(
  userId: string,
  id: string,
): Promise<StayRequestReceipt | null> {
  if (!uuid.safeParse(userId).success || !uuid.safeParse(id).success)
    return null;
  const [row] = await readReceipts({ userId, id });
  return row ? receipt(row) : null;
}
export async function withdrawStayRequest(
  userId: string,
  id: string,
): Promise<StayRequestReceipt | null> {
  if (!uuid.safeParse(userId).success || !uuid.safeParse(id).success)
    return null;
  return getDatabaseConnection().sql.begin(async (tx) => {
    const reader = { userId, id };
    const [owned] = await tx<
      { home_id: string }[]
    >`select r.home_id from public.stay_requests r where ${scope(tx, reader)}`;
    if (!owned) return null;
    await lockBookingHome(tx, owned.home_id);
    await expirePending(tx, reader);
    await tx`update public.stay_requests r set status='withdrawn',version=version+1,updated_at=now(),terminal_at=now()
      where ${scope(tx, reader)} and r.status='pending'`;
    const [row] = await selectReceipts(tx, reader);
    return row ? receipt(row) : null;
  });
}
export async function listHostPendingStayRequests(
  host: Host,
): Promise<HostStayRequestReceipt[]> {
  if (!uuid.safeParse(host.id).success || !uuid.safeParse(host.homeId).success)
    return [];
  return (await readReceipts({ host })).map((row) => ({
    ...receipt(row),
    requesterEmail: row.requesterEmail!,
  }));
}

/** The original host notification remains readable after the card leaves the pending queue. */
export async function getHostStayRequestOutcome(host: Host, id: string) {
  if (
    ![host.id, host.homeId, id].every((value) => uuid.safeParse(value).success)
  )
    return null;
  return getDatabaseConnection().sql.begin(async (tx) => {
    const reader = { host, id };
    await expirePending(tx, reader);
    const [row] = await tx<
      {
        status: StayRequestStatus;
        actor: string | null;
        visitStatus: VisitStatus | null;
      }[]
    >`
      select r.status, h.display_name as actor, v.status as "visitStatus"
      from public.stay_requests r
      left join public.hosts h on h.id=r.decided_by_host_id and h.home_id=r.home_id
      left join public.visits v on v.id=r.visit_id and v.home_id=r.home_id
      where ${scope(tx, reader)}`;
    return row ?? null;
  });
}
