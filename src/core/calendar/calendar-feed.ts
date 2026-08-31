import "@/core/server-only";

import { sqlClient, type DatabaseClient } from "@/core/db/client";
import type { Locale, StayRange } from "@/core/db/schema";
import {
  auditHostAction as audit,
  lockHomeAndHost,
} from "@/core/host-operations";

import { hashCalendarFeedToken, issueCalendarFeedToken } from "./feed-token";
import type { CalendarDocument, CalendarEvent } from "./ical";

export interface IssueCalendarFeedInput {
  homeId: string;
  hostId: string;
  label: string;
  locale: Locale;
  secret: string;
}

export interface IssuedCalendarFeed {
  id: string;
  label: string;
  locale: Locale;
  token: string;
}

interface EventRow {
  id: string;
  kind: CalendarEvent["kind"];
  stay_start: string;
  stay_end: string;
  event_status: CalendarEvent["status"];
  calendar_sequence: number;
  calendar_updated_at: Date | string;
  guest_count: number | null;
  room_labels: string[];
}

export const MAX_CALENDAR_EVENTS = 500;

export async function issueCalendarFeed(
  database: DatabaseClient,
  input: IssueCalendarFeedInput,
): Promise<IssuedCalendarFeed> {
  const label = input.label.trim();
  if (!label) throw new RangeError("Calendar feed label is required");
  const issued = issueCalendarFeedToken(input.secret);

  return sqlClient(database).begin(async (transaction) => {
    await lockHomeAndHost(transaction, input.homeId, input.hostId);
    const [feed] = await transaction<{ id: string }[]>`
      insert into public.calendar_feeds (
        home_id, created_by_host_id, label, locale, token_hash
      ) values (
        ${input.homeId}, ${input.hostId}, ${label}, ${input.locale},
        ${Buffer.from(issued.tokenHash)}
      )
      returning id
    `;
    if (!feed) throw new Error("Failed to issue the calendar feed");
    await audit(transaction, input.homeId, "calendar_feed_issued", {
      feedId: feed.id,
      label,
      locale: input.locale,
    });
    return { id: feed.id, label, locale: input.locale, token: issued.token };
  });
}

export async function revokeCalendarFeed(
  database: DatabaseClient,
  input: { homeId: string; hostId: string; feedId: string },
): Promise<boolean> {
  return sqlClient(database).begin(async (transaction) => {
    await lockHomeAndHost(transaction, input.homeId, input.hostId);
    const [revoked] = await transaction<{ id: string }[]>`
      update public.calendar_feeds
      set revoked_at = now()
      where id = ${input.feedId} and home_id = ${input.homeId}
        and revoked_at is null
      returning id
    `;
    if (revoked) {
      await audit(transaction, input.homeId, "calendar_feed_revoked", {
        feedId: input.feedId,
      });
      return true;
    }
    const [existing] = await transaction<{ id: string }[]>`
      select id from public.calendar_feeds
      where id = ${input.feedId} and home_id = ${input.homeId}
    `;
    return existing !== undefined;
  });
}

export async function loadCalendarFeed(
  database: DatabaseClient,
  token: string,
  secret: string,
): Promise<CalendarDocument | null> {
  const sql = sqlClient(database);
  const tokenHash = hashCalendarFeedToken(token, secret);
  return sql.begin(async (transaction) => {
    const [feed] = await transaction<
      {
        home_id: string;
        locale: Locale;
        timezone: string;
      }[]
    >`
      select feed.home_id, feed.locale, home.timezone
      from public.calendar_feeds feed
      join public.homes home on home.id = feed.home_id
      where feed.token_hash = ${Buffer.from(tokenHash)}
        and feed.revoked_at is null
      limit 1
      for share of feed
    `;
    if (!feed) return null;

    const rows = await transaction<EventRow[]>`
      with candidate_events as (
        select
          visit.id,
          'visit'::text as kind,
          lower(visit.stay)::text as stay_start,
          upper(visit.stay)::text as stay_end,
          case when visit.status = 'cancelled'
            then 'cancelled' else 'confirmed' end as event_status,
          visit.calendar_sequence,
          coalesce(
            visit.calendar_updated_at,
            visit.calendar_eligible_at,
            visit.confirmed_at,
            visit.created_at
          ) as calendar_updated_at,
          (visit.adults + visit.children)::integer as guest_count
        from public.visits visit
        where visit.home_id = ${feed.home_id}
          and visit.calendar_eligible_at is not null
          and visit.status in (
            'confirmed', 'reconfirm_pending', 'reconfirmed', 'escalated',
            'cancelled'
          )

        union all

        select
          block.id,
          'private_block'::text as kind,
          lower(block.stay)::text as stay_start,
          upper(block.stay)::text as stay_end,
          case when block.status = 'cancelled'
            then 'cancelled' else 'confirmed' end as event_status,
          block.calendar_sequence,
          coalesce(
            block.calendar_updated_at,
            block.calendar_eligible_at,
            block.created_at
          ) as calendar_updated_at,
          null::integer as guest_count
        from public.private_room_blocks block
        where block.home_id = ${feed.home_id}
          and block.calendar_eligible_at is not null
          and block.status in ('active', 'cancelled')

        order by stay_start desc, kind, id
        limit ${MAX_CALENDAR_EVENTS}
      )
      select candidate.*,
        coalesce(assigned.room_labels, '{}'::text[]) as room_labels
      from candidate_events candidate
      left join lateral (
        select array_agg(
          room.guest_label order by room.display_order, room.id
        ) filter (where room.guest_label is not null) as room_labels
        from public.visit_rooms occupancy
        join public.rooms room on room.id = occupancy.room_id
        where (
          candidate.kind = 'visit' and occupancy.visit_id = candidate.id
        ) or (
          candidate.kind = 'private_block'
          and occupancy.private_block_id = candidate.id
        )
      ) assigned on true
      order by candidate.stay_start desc, candidate.kind, candidate.id
    `;

    return {
      calendarName:
        feed.locale === "es"
          ? "Estancias del hogar en L'Ayalga"
          : "L'Ayalga household stays",
      locale: feed.locale,
      timeZone: feed.timezone,
      events: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        stay: [row.stay_start, row.stay_end] as StayRange,
        status: row.event_status,
        sequence: row.calendar_sequence,
        updatedAt: row.calendar_updated_at,
        guestCount: row.guest_count,
        roomLabels: row.room_labels,
      })),
    };
  });
}
