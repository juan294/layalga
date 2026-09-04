import {
  findInvitationById,
  findInvitationByToken,
  type InvitationByToken,
} from "@/core/booking/invitations";
import {
  getDatabaseConnection,
  sqlClient,
  type DatabaseClient,
} from "@/core/db/client";

export type GuestIdentity = { token: string } | { invitationId: string };

export type GuestVisitStatus =
  | "hold"
  | "confirmed"
  | "reconfirm_pending"
  | "reconfirmed"
  | "escalated"
  | "cancelled";

export interface GuestVisit {
  id: string;
  stay: readonly [string, string];
  adults: number;
  children: number;
  pets: number;
  status: GuestVisitStatus;
  roomCount: number;
  roomLabels: string[];
  hasOverlap: boolean;
  chaseMessage: string | null;
  holdExpiresAt: string | null;
  holdExpired: boolean;
  preArrival: boolean;
  timeZone: string;
}

export interface GuestInvitationData {
  id: string;
  homeId: string;
  partyId: string;
  partyName: string;
  partyLocale: "en" | "es";
  structured: Record<string, unknown>;
  visit: GuestVisit | null;
}

export interface GuestInvitationAuthority {
  id: string;
  homeId: string;
  partyId: string;
}

export function partyDefaults(structured: Record<string, unknown>) {
  return {
    adults: count(structured.adults, 1),
    children: count(structured.children, 0),
    pets: count(structured.pets, 0),
  };
}

export async function resolveGuestInvitationAuthority(
  identity: GuestIdentity,
): Promise<GuestInvitationAuthority | null> {
  const database = getDatabaseConnection().db;
  const invitation = await findInvitationForIdentity(database, identity);
  return invitation
    ? {
        id: invitation.id,
        homeId: invitation.homeId,
        partyId: invitation.partyId,
      }
    : null;
}

export async function loadGuestInvitation(
  identity: GuestIdentity,
  locale: "en" | "es",
): Promise<GuestInvitationData | null> {
  const connection = getDatabaseConnection();
  const invitation = await findInvitationForIdentity(connection.db, identity);
  if (!invitation) return null;

  const sql = sqlClient(connection.db);
  const [visit] = await sql<
    {
      id: string;
      stay_start: string;
      stay_end: string;
      adults: number;
      children: number;
      pets: number;
      status: GuestVisitStatus;
      room_count: number;
      room_labels: string[];
      has_overlap: boolean;
      hold_expires_at: Date | string | null;
      hold_expired: boolean;
      pre_arrival: boolean;
      timezone: string;
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
      v.hold_expires_at,
      h.timezone,
      v.hold_expires_at is not null
        and v.hold_expires_at <= coalesce(dc.now, now()) as hold_expired,
      lower(v.stay) >
        (coalesce(dc.now, now()) at time zone h.timezone)::date as pre_arrival,
      coalesce(assigned.room_count, 0) as room_count,
      coalesce(assigned.room_labels, '{}'::text[]) as room_labels,
      exists (
        select 1
        from public.visits other
        where other.home_id = v.home_id
          and other.id <> v.id
          and other.status in (
            'hold', 'confirmed', 'reconfirm_pending', 'reconfirmed', 'escalated'
          )
          and other.stay && v.stay
      ) as has_overlap
    from public.visits v
    join public.homes h on h.id = v.home_id
    left join public.demo_clock dc on dc.home_id = h.id and dc.enabled
    left join lateral (
      select
        count(*)::integer as room_count,
        coalesce(
          array_agg(r.guest_label order by r.display_order, r.id)
            filter (where r.guest_label is not null),
          '{}'::text[]
        ) as room_labels
      from public.visit_rooms vr
      join public.rooms r on r.id = vr.room_id
      where vr.visit_id = v.id
    ) assigned on true
    where v.invitation_id = ${invitation.id}
    order by v.created_at desc
    limit 1
  `;

  let chaseMessage: string | null = null;
  if (
    visit &&
    (visit.status === "reconfirm_pending" || visit.status === "escalated")
  ) {
    const [notification] = await sql<{ body_en: string; body_es: string }[]>`
      select body_en, body_es
      from public.notifications
      where recipient_kind = 'party'
        and recipient_id = ${invitation.partyId}
        and visit_id = ${visit.id}
        and kind = 'reconfirm_chase'
      order by created_at desc
      limit 1
    `;
    chaseMessage = notification
      ? locale === "es"
        ? notification.body_es
        : notification.body_en
      : null;
  }

  return {
    id: invitation.id,
    homeId: invitation.homeId,
    partyId: invitation.partyId,
    partyName: invitation.partyName,
    partyLocale: invitation.partyLocale,
    structured: record(invitation.structured),
    visit: visit
      ? {
          id: visit.id,
          stay: [visit.stay_start, visit.stay_end],
          adults: visit.adults,
          children: visit.children,
          pets: visit.pets,
          status: visit.status,
          roomCount: visit.room_count,
          roomLabels: visit.room_labels,
          hasOverlap: visit.has_overlap,
          chaseMessage,
          holdExpiresAt: visit.hold_expires_at
            ? new Date(visit.hold_expires_at).toISOString()
            : null,
          holdExpired: visit.hold_expired,
          preArrival: visit.pre_arrival,
          timeZone: visit.timezone,
        }
      : null,
  };
}

function findInvitationForIdentity(
  database: DatabaseClient,
  identity: GuestIdentity,
): Promise<InvitationByToken | null> {
  return "token" in identity
    ? findInvitationByToken(database, identity.token)
    : findInvitationById(database, identity.invitationId);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}
