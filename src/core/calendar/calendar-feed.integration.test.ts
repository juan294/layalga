import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  issueCalendarFeed,
  loadCalendarFeed,
  revokeCalendarFeed,
} from "./calendar-feed";
import { renderICalendar } from "./ical";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const db = postgres(connectionUrl, { max: 4, prepare: false });
const secret = "calendar-feed-integration-secret-32-bytes-minimum";

describe("calendar feed service", () => {
  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("stores only a token HMAC, reads without writes, and revokes uniformly", async () => {
    const suffix = randomUUID();
    const [home] = await db<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Calendar home ${suffix}`}, 'Europe/Madrid') returning id
    `;
    const [host] = await db<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home!.id}, 'Private host name', 'en') returning id
    `;
    const [party] = await db<{ id: string }[]>`
      insert into public.parties (home_id, family_name, locale, link_token)
      values (${home!.id}, 'Private family name', 'en', ${`private-${suffix}`})
      returning id
    `;
    const [invitation] = await db<{ id: string }[]>`
      insert into public.invitations (
        home_id, host_id, party_id, raw_message, structured
      ) values (
        ${home!.id}, ${host!.id}, ${party!.id}, 'Private invitation text',
        ${db.json({ email: "private@example.com" })}
      ) returning id
    `;
    const [room] = await db<{ id: string }[]>`
      insert into public.rooms (
        home_id, name, beds, guest_label, floor_label, sleeping_arrangement,
        maximum_capacity, inventory_state, private_notes
      ) values (
        ${home!.id}, 'Internal room name', 2, 'Garden room', 'Ground',
        'Double bed', 2, 'available', 'Private room note'
      ) returning id
    `;
    const [visit] = await db<{ id: string }[]>`
      insert into public.visits (
        home_id, party_id, invitation_id, stay, adults, children,
        special_requests, status, confirmed_at, calendar_eligible_at,
        calendar_updated_at
      ) values (
        ${home!.id}, ${party!.id}, ${invitation!.id},
        daterange('2026-11-10', '2026-11-13', '[)'), 2, 1,
        array['Private request'], 'confirmed', now(), now(), now()
      ) returning id
    `;
    await db`
      insert into public.visit_rooms (visit_id, room_id, home_id, stay)
      values (
        ${visit!.id}, ${room!.id}, ${home!.id},
        daterange('2026-11-10', '2026-11-13', '[)')
      )
    `;

    try {
      const issued = await issueCalendarFeed(db, {
        homeId: home!.id,
        hostId: host!.id,
        label: "Family devices",
        locale: "en",
        secret,
      });
      const [stored] = await db<
        { token_hash_text: string; audit_count: number }[]
      >`
        select encode(token_hash, 'hex') as token_hash_text,
          (select count(*)::integer from public.audit_events
            where home_id = ${home!.id}) as audit_count
        from public.calendar_feeds where id = ${issued.id}
      `;
      expect(stored?.token_hash_text).toHaveLength(64);
      expect(stored?.token_hash_text).not.toContain(issued.token);

      const first = await loadCalendarFeed(db, issued.token, secret);
      const second = await loadCalendarFeed(db, issued.token, secret);
      expect(second).toEqual(first);
      const body = renderICalendar(first!);
      expect(body).toContain("X-WR-CALNAME:L'Ayalga household stays");
      expect(body).toContain("SUMMARY:Guest stay");
      expect(body).toContain("Guests: 3");
      expect(body).toContain("Garden room");
      for (const secretText of [
        "Private host name",
        "Private family name",
        "Private invitation text",
        "private@example.com",
        "Private request",
        "Private room note",
        "Internal room name",
        `Calendar home ${suffix}`,
        issued.token,
      ]) {
        expect(body).not.toContain(secretText);
      }
      const [afterRead] = await db<{ audit_count: number }[]>`
        select count(*)::integer as audit_count from public.audit_events
        where home_id = ${home!.id}
      `;
      expect(afterRead?.audit_count).toBe(stored?.audit_count);

      expect(
        await revokeCalendarFeed(db, {
          homeId: home!.id,
          hostId: host!.id,
          feedId: issued.id,
        }),
      ).toBe(true);
      expect(await loadCalendarFeed(db, issued.token, secret)).toBeNull();
      expect(await loadCalendarFeed(db, "unknown-token", secret)).toBeNull();
    } finally {
      await db`delete from public.homes where id = ${home!.id}`;
    }
  });
});
