import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const db = postgres(connectionUrl, { max: 4, prepare: false });

interface Fixture {
  homeId: string;
  hostId: string;
  invitationId: string;
  roomId: string;
  visitId: string;
}

async function seedFixture(sql: Sql, label: string): Promise<Fixture> {
  const suffix = randomUUID();
  const [home] = await sql<{ id: string }[]>`
    insert into public.homes (name, timezone)
    values (${`${label} ${suffix}`}, 'Europe/Madrid')
    returning id
  `;
  if (!home) throw new Error("Failed to seed room-schema home");

  const [host] = await sql<{ id: string }[]>`
    insert into public.hosts (home_id, display_name, locale)
    values (${home.id}, 'Schema host', 'en')
    returning id
  `;
  if (!host) throw new Error("Failed to seed room-schema host");

  const rooms = await sql<{ id: string }[]>`
    insert into public.rooms (
      home_id,
      name,
      beds,
      guest_label,
      floor_label,
      sleeping_arrangement,
      maximum_capacity,
      inventory_state,
      overflow_policy,
      display_order
    ) values (
      ${home.id},
      'Schema room',
      2,
      'Garden room',
      'Ground floor',
      'One double bed',
      2,
      'available',
      'none',
      1
    )
    returning id
  `;
  const [room] = rooms;
  if (!room) throw new Error("Failed to seed room-schema room");

  const [party] = await sql<{ id: string }[]>`
    insert into public.parties (home_id, family_name, locale, link_token)
    values (${home.id}, 'Schema party', 'en', ${`schema-${suffix}`})
    returning id
  `;
  if (!party) throw new Error("Failed to seed room-schema party");

  const [invitation] = await sql<{ id: string }[]>`
    insert into public.invitations (home_id, host_id, party_id, raw_message)
    values (${home.id}, ${host.id}, ${party.id}, 'Schema fixture')
    returning id
  `;
  if (!invitation) throw new Error("Failed to seed room-schema invitation");

  const [visit] = await sql<{ id: string }[]>`
    insert into public.visits (
      home_id,
      party_id,
      invitation_id,
      stay,
      adults,
      status
    ) values (
      ${home.id},
      ${party.id},
      ${invitation.id},
      daterange('2026-10-10', '2026-10-12', '[)'),
      2,
      'confirmed'
    )
    returning id
  `;
  if (!visit) throw new Error("Failed to seed room-schema visit");

  return {
    homeId: home.id,
    hostId: host.id,
    invitationId: invitation.id,
    roomId: room.id,
    visitId: visit.id,
  };
}

describe("agent-first room schema", () => {
  beforeAll(async () => {
    const [schema] = await db<
      {
        blocks: string | null;
        feeds: string | null;
        overrides: string | null;
        proposals: string | null;
      }[]
    >`
      select
        to_regclass('public.private_room_blocks')::text as blocks,
        to_regclass('public.calendar_feeds')::text as feeds,
        to_regclass('public.room_availability_overrides')::text as overrides,
        to_regclass('public.room_action_proposals')::text as proposals
    `;
    if (
      !schema?.blocks ||
      !schema.feeds ||
      !schema.overrides ||
      !schema.proposals
    ) {
      throw new Error(
        "Agent-first room schema is missing; run `supabase db reset` after creating the migration",
      );
    }
  });

  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("backfills the synthetic inventory and preserves the physical occupancy table", async () => {
    const [room] = await db<
      {
        beds: number;
        guest_label: string;
        inventory_state: string;
        maximum_capacity: number;
      }[]
    >`
      select beds, guest_label, inventory_state, maximum_capacity
      from public.rooms
      where id = '00000000-0000-4000-8000-000000000101'
    `;
    const [ledger] = await db<
      { ledger: string | null; exclusion_count: number }[]
    >`
      select
        to_regclass('public.visit_rooms')::text as ledger,
        count(*) filter (
          where conname = 'visit_rooms_no_overlap' and contype = 'x'
        )::integer as exclusion_count
      from pg_constraint
      where conrelid = 'public.visit_rooms'::regclass
    `;

    expect(room).toEqual({
      beds: 2,
      guest_label: "Horreu Room",
      inventory_state: "available",
      maximum_capacity: 2,
    });
    expect(ledger).toEqual({
      ledger: "visit_rooms",
      exclusion_count: 1,
    });
  });

  it("uses one exclusion constraint for visit occupancy and private blocks", async () => {
    const fixture = await seedFixture(db, "Shared occupancy");
    try {
      await db`
        insert into public.visit_rooms (visit_id, room_id, home_id, stay)
        values (
          ${fixture.visitId},
          ${fixture.roomId},
          ${fixture.homeId},
          daterange('2026-10-10', '2026-10-12', '[)')
        )
      `;
      const [block] = await db<{ id: string }[]>`
        insert into public.private_room_blocks (
          home_id,
          stay,
          public_label,
          created_by_host_id,
          idempotency_key,
          request_hash
        ) values (
          ${fixture.homeId},
          daterange('2026-10-11', '2026-10-13', '[)'),
          'Private room use',
          ${fixture.hostId},
          ${`block-${randomUUID()}`},
          ${randomUUID()}
        )
        returning id
      `;
      if (!block) throw new Error("Failed to seed private room block");

      await expect(
        db`
          insert into public.visit_rooms (
            private_block_id, room_id, home_id, stay
          ) values (
            ${block.id},
            ${fixture.roomId},
            ${fixture.homeId},
            daterange('2026-10-11', '2026-10-13', '[)')
          )
        `,
      ).rejects.toMatchObject({ code: "23P01" });
    } finally {
      await db`delete from public.homes where id = ${fixture.homeId}`;
    }
  });

  it("requires exactly one occupancy source", async () => {
    const fixture = await seedFixture(db, "Occupancy source");
    try {
      await expect(
        db`
          insert into public.visit_rooms (room_id, home_id, stay)
          values (
            ${fixture.roomId},
            ${fixture.homeId},
            daterange('2026-11-01', '2026-11-03', '[)')
          )
        `,
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await db`delete from public.homes where id = ${fixture.homeId}`;
    }
  });

  it("enforces complete ready inventory and overflow metadata", async () => {
    const suffix = randomUUID();
    const [home] = await db<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Inventory checks ${suffix}`}, 'Europe/Madrid')
      returning id
    `;
    if (!home) throw new Error("Failed to seed inventory-check home");

    try {
      await expect(
        db`
          insert into public.rooms (
            home_id, name, beds, maximum_capacity, inventory_state
          ) values (${home.id}, 'Incomplete', 2, 2, 'available')
        `,
      ).rejects.toMatchObject({ code: "23514" });

      await expect(
        db`
          insert into public.rooms (
            home_id,
            name,
            beds,
            guest_label,
            floor_label,
            sleeping_arrangement,
            maximum_capacity,
            inventory_state,
            overflow_policy
          ) values (
            ${home.id},
            'Broken overflow',
            2,
            'Overflow room',
            'Ground floor',
            'One sofa bed',
            4,
            'available',
            'host_approval'
          )
        `,
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await db`delete from public.homes where id = ${home.id}`;
    }
  });

  it("rejects cross-home availability and proposal-room relationships", async () => {
    const left = await seedFixture(db, "Cross-home left");
    const right = await seedFixture(db, "Cross-home right");
    try {
      await expect(
        db`
          insert into public.room_availability_overrides (
            home_id,
            room_id,
            stay,
            action,
            created_by_host_id,
            idempotency_key,
            request_hash
          ) values (
            ${right.homeId},
            ${left.roomId},
            daterange('2026-12-01', '2026-12-03', '[)'),
            'close',
            ${right.hostId},
            ${`override-${randomUUID()}`},
            ${randomUUID()}
          )
        `,
      ).rejects.toMatchObject({ code: "23503" });

      const [proposal] = await db<{ id: string }[]>`
        insert into public.room_action_proposals (
          home_id,
          requested_by_host_id,
          kind,
          stay,
          summary,
          idempotency_key,
          request_hash
        ) values (
          ${right.homeId},
          ${right.hostId},
          'close',
          daterange('2026-12-01', '2026-12-03', '[)'),
          'Close a room',
          ${`proposal-${randomUUID()}`},
          ${randomUUID()}
        )
        returning id
      `;
      if (!proposal) throw new Error("Failed to seed room proposal");

      await expect(
        db`
          insert into public.room_action_proposal_rooms (
            proposal_id, room_id, home_id
          ) values (${proposal.id}, ${left.roomId}, ${right.homeId})
        `,
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await db`delete from public.homes where id in (${left.homeId}, ${right.homeId})`;
    }
  });

  it("rejects every new cross-home host, run, and block relationship", async () => {
    const left = await seedFixture(db, "Relationship left");
    const right = await seedFixture(db, "Relationship right");
    try {
      await expect(
        db`
          insert into public.private_room_blocks (
            home_id,
            stay,
            public_label,
            created_by_host_id,
            idempotency_key,
            request_hash
          ) values (
            ${right.homeId},
            daterange('2027-01-01', '2027-01-03', '[)'),
            'Private room use',
            ${left.hostId},
            ${`block-host-${randomUUID()}`},
            ${randomUUID()}
          )
        `,
      ).rejects.toMatchObject({ code: "23503" });

      await expect(
        db`
          insert into public.calendar_feeds (
            home_id,
            created_by_host_id,
            label,
            locale,
            token_hash
          ) values (
            ${right.homeId},
            ${left.hostId},
            'Family calendar',
            'en',
            decode(md5(${randomUUID()}), 'hex')
          )
        `,
      ).rejects.toMatchObject({ code: "23503" });

      const [run] = await db<{ id: string }[]>`
        insert into public.runs (home_id, session_id, task, status, payload)
        values (${left.homeId}, ${`room-${randomUUID()}`}, 'host_room_request', 'completed', '{}')
        returning id
      `;
      if (!run) throw new Error("Failed to seed the proposal run");

      await expect(
        db`
          insert into public.room_action_proposals (
            home_id,
            requested_by_host_id,
            run_id,
            kind,
            stay,
            summary,
            idempotency_key,
            request_hash
          ) values (
            ${right.homeId},
            ${right.hostId},
            ${run.id},
            'close',
            daterange('2027-01-01', '2027-01-03', '[)'),
            'Close a room',
            ${`proposal-run-${randomUUID()}`},
            ${randomUUID()}
          )
        `,
      ).rejects.toMatchObject({ code: "23503" });

      const [block] = await db<{ id: string }[]>`
        insert into public.private_room_blocks (
          home_id,
          stay,
          public_label,
          created_by_host_id,
          idempotency_key,
          request_hash
        ) values (
          ${right.homeId},
          daterange('2027-01-01', '2027-01-03', '[)'),
          'Private room use',
          ${right.hostId},
          ${`block-home-${randomUUID()}`},
          ${randomUUID()}
        )
        returning id
      `;
      if (!block) throw new Error("Failed to seed the private block");

      await expect(
        db`
          insert into public.visit_rooms (
            private_block_id,
            room_id,
            home_id,
            stay
          ) values (
            ${block.id},
            ${left.roomId},
            ${left.homeId},
            daterange('2027-01-01', '2027-01-03', '[)')
          )
        `,
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await db`delete from public.homes where id in (${left.homeId}, ${right.homeId})`;
    }
  });

  it("denies the agent runtime access to private notes and calendar hashes", async () => {
    const [privileges] = await db<
      {
        block_notes: boolean;
        calendar_hash: boolean;
        override_notes: boolean;
        proposal_notes: boolean;
        room_notes: boolean;
      }[]
    >`
      select
        has_column_privilege(
          'layalga_agent_runtime',
          'public.private_room_blocks',
          'private_note',
          'SELECT'
        ) as block_notes,
        has_column_privilege(
          'layalga_agent_runtime',
          'public.calendar_feeds',
          'token_hash',
          'SELECT'
        ) as calendar_hash,
        has_column_privilege(
          'layalga_agent_runtime',
          'public.room_availability_overrides',
          'private_note',
          'SELECT'
        ) as override_notes,
        has_column_privilege(
          'layalga_agent_runtime',
          'public.room_action_proposals',
          'private_note',
          'SELECT'
        ) as proposal_notes,
        has_column_privilege(
          'layalga_agent_runtime',
          'public.rooms',
          'private_notes',
          'SELECT'
        ) as room_notes
    `;

    expect(privileges).toEqual({
      block_notes: false,
      calendar_hash: false,
      override_notes: false,
      proposal_notes: false,
      room_notes: false,
    });
  });
});
