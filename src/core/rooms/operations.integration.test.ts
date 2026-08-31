import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  applyRoomActionProposal,
  cancelPrivateRoomBlock,
  createRoomInventory,
  createPrivateRoomBlock,
  createRoomAvailabilityOverride,
  dismissRoomActionProposal,
  removeRoomAvailabilityOverride,
  RoomOperationIdempotencyError,
  RoomOperationConflictError,
  updateRoomInventory,
} from "./operations";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const db = postgres(connectionUrl, { max: 4, prepare: false });
const DB_TEST_TIMEOUT_MS = 60_000;

async function fixture() {
  const suffix = randomUUID();
  const [home] = await db<{ id: string }[]>`
    insert into public.homes (name, timezone)
    values (${`Room operations ${suffix}`}, 'Europe/Madrid') returning id
  `;
  if (!home) throw new Error("Failed to create the room-operation home");
  const [host] = await db<{ id: string }[]>`
    insert into public.hosts (home_id, display_name, locale)
    values (${home.id}, 'Host', 'en') returning id
  `;
  const rooms = await db<{ id: string; inventory_state: string }[]>`
    insert into public.rooms (
      home_id, name, beds, guest_label, floor_label, sleeping_arrangement,
      maximum_capacity, inventory_state, overflow_policy, display_order
    ) values
      (${home.id}, 'Open room', 2, 'Open room', 'Ground', 'Double bed', 2, 'available', 'none', 0),
      (${home.id}, 'Withheld room', 2, 'Withheld room', 'Upper', 'Double bed', 2, 'withheld', 'none', 1)
    returning id, inventory_state
  `;
  if (!host || rooms.length !== 2) throw new Error("Failed to create rooms");
  return {
    homeId: home.id,
    hostId: host.id,
    openRoomId: rooms.find((room) => room.inventory_state === "available")!.id,
    withheldRoomId: rooms.find((room) => room.inventory_state === "withheld")!
      .id,
  };
}

describe("host room operations", () => {
  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it(
    "creates one idempotent private block and cancels only its occupancy",
    async () => {
      const data = await fixture();
      try {
        const input = {
          homeId: data.homeId,
          hostId: data.hostId,
          roomIds: [data.openRoomId],
          stay: ["2026-11-10", "2026-11-14"] as const,
          publicLabel: "Reserved by host",
          privateNote: "Sensitive family detail",
          idempotencyKey: `block-${randomUUID()}`,
        };
        const first = await createPrivateRoomBlock(db, input);
        const retry = await createPrivateRoomBlock(db, input);
        expect(retry).toEqual(first);
        await expect(
          createPrivateRoomBlock(db, {
            ...input,
            stay: ["2026-11-11", "2026-11-15"],
          }),
        ).rejects.toBeInstanceOf(RoomOperationIdempotencyError);

        const cancelled = await cancelPrivateRoomBlock(
          db,
          first.id,
          data.hostId,
        );
        expect(cancelled).toMatchObject({ id: first.id, status: "cancelled" });
        const [counts] = await db<
          { occupancies: number; leaked_notes: number }[]
        >`
        select
          (select count(*)::integer from public.visit_rooms where private_block_id = ${first.id}) as occupancies,
          (select count(*)::integer from public.audit_events
            where home_id = ${data.homeId} and payload::text like '%Sensitive family detail%') as leaked_notes
      `;
        expect(counts).toEqual({ occupancies: 0, leaked_notes: 0 });
      } finally {
        await db`delete from public.homes where id = ${data.homeId}`;
      }
    },
    DB_TEST_TIMEOUT_MS,
  );

  it(
    "creates and removes state-compatible date overrides",
    async () => {
      const data = await fixture();
      try {
        const opened = await createRoomAvailabilityOverride(db, {
          homeId: data.homeId,
          hostId: data.hostId,
          roomId: data.withheldRoomId,
          stay: ["2026-12-01", "2026-12-10"],
          action: "open",
          idempotencyKey: `open-${randomUUID()}`,
        });
        const closed = await createRoomAvailabilityOverride(db, {
          homeId: data.homeId,
          hostId: data.hostId,
          roomId: data.openRoomId,
          stay: ["2026-12-01", "2026-12-10"],
          action: "close",
          idempotencyKey: `close-${randomUUID()}`,
        });
        expect(opened.action).toBe("open");
        expect(closed.action).toBe("close");

        await removeRoomAvailabilityOverride(db, opened.id, data.hostId);
        const [row] = await db<{ count: number }[]>`
        select count(*)::integer as count from public.room_availability_overrides
        where id = ${opened.id}
      `;
        expect(row?.count).toBe(0);
      } finally {
        await db`delete from public.homes where id = ${data.homeId}`;
      }
    },
    DB_TEST_TIMEOUT_MS,
  );

  it(
    "creates and edits inventory only inside the authenticated host home",
    async () => {
      const data = await fixture();
      const other = await fixture();
      try {
        const created = await createRoomInventory(db, {
          homeId: data.homeId,
          hostId: data.hostId,
          name: "Internal office",
          guestLabel: "Study room",
          floorLabel: "Upper floor",
          sleepingArrangement: "Double air mattress",
          standardCapacity: 2,
          maximumCapacity: 2,
          inventoryState: "withheld",
          overflowPolicy: "none",
          displayOrder: 9,
          privateNotes: "Release only after host review",
        });
        await updateRoomInventory(db, {
          homeId: data.homeId,
          hostId: data.hostId,
          roomId: created.id,
          name: "Internal office",
          guestLabel: "Study room",
          floorLabel: "Upper floor",
          sleepingArrangement: "Double air mattress",
          standardCapacity: 2,
          maximumCapacity: 2,
          inventoryState: "available",
          overflowPolicy: "none",
          displayOrder: 9,
        });
        const [room] = await db<
          {
            guest_label: string;
            inventory_state: string;
            private_notes: string | null;
          }[]
        >`
        select guest_label, inventory_state, private_notes
        from public.rooms where id = ${created.id}
      `;
        expect(room).toEqual({
          guest_label: "Study room",
          inventory_state: "available",
          private_notes: null,
        });

        await expect(
          updateRoomInventory(db, {
            homeId: other.homeId,
            hostId: other.hostId,
            roomId: created.id,
            name: "Cross-home",
            guestLabel: "Cross-home",
            floorLabel: "Other",
            sleepingArrangement: "Bed",
            standardCapacity: 1,
            maximumCapacity: 1,
            inventoryState: "available",
            overflowPolicy: "none",
            displayOrder: 0,
          }),
        ).rejects.toBeInstanceOf(RoomOperationConflictError);
      } finally {
        await db`delete from public.homes where id in (${data.homeId}, ${other.homeId})`;
      }
    },
    DB_TEST_TIMEOUT_MS,
  );

  it(
    "keeps proposal status and its room mutation atomic under apply/dismiss races",
    async () => {
      const data = await fixture();
      try {
        const [proposal] = await db<{ id: string }[]>`
          insert into public.room_action_proposals (
            home_id, requested_by_host_id, kind, stay, summary,
            idempotency_key, request_hash
          ) values (
            ${data.homeId}, ${data.hostId}, 'private_block',
            daterange('2026-12-20', '2026-12-22', '[)'),
            'Reserved by host', ${`test-${randomUUID()}`}, ${"a".repeat(64)}
          ) returning id
        `;
        await db`
          insert into public.room_action_proposal_rooms (
            proposal_id, room_id, home_id
          ) values (${proposal!.id}, ${data.openRoomId}, ${data.homeId})
        `;

        await Promise.all([
          applyRoomActionProposal(db, {
            homeId: data.homeId,
            hostId: data.hostId,
            proposalId: proposal!.id,
          }),
          dismissRoomActionProposal(db, {
            homeId: data.homeId,
            hostId: data.hostId,
            proposalId: proposal!.id,
          }),
        ]);
        const [result] = await db<{ status: string; block_count: number }[]>`
          select proposal.status,
            (select count(*)::integer from public.private_room_blocks block
              where block.idempotency_key = ${`proposal:${proposal!.id}`}) as block_count
          from public.room_action_proposals proposal
          where proposal.id = ${proposal!.id}
        `;
        expect(result?.status).toMatch(/^(applied|dismissed)$/);
        expect(result?.block_count).toBe(result?.status === "applied" ? 1 : 0);
      } finally {
        await db`delete from public.homes where id = ${data.homeId}`;
      }
    },
    DB_TEST_TIMEOUT_MS,
  );

  it(
    "rejects a private-block proposal after its room becomes inactive",
    async () => {
      const data = await fixture();
      try {
        const [proposal] = await db<{ id: string }[]>`
          insert into public.room_action_proposals (
            home_id, requested_by_host_id, kind, stay, summary,
            idempotency_key, request_hash
          ) values (
            ${data.homeId}, ${data.hostId}, 'private_block',
            daterange('2027-01-10', '2027-01-12', '[)'),
            'Stale room proposal', ${`test-${randomUUID()}`}, ${"b".repeat(64)}
          ) returning id
        `;
        await db`
          insert into public.room_action_proposal_rooms (
            proposal_id, room_id, home_id
          ) values (${proposal!.id}, ${data.openRoomId}, ${data.homeId})
        `;
        await db`
          update public.rooms set inventory_state = 'inactive'
          where id = ${data.openRoomId}
        `;

        await expect(
          applyRoomActionProposal(db, {
            homeId: data.homeId,
            hostId: data.hostId,
            proposalId: proposal!.id,
          }),
        ).rejects.toBeInstanceOf(RoomOperationConflictError);
        const [result] = await db<{ status: string; block_count: number }[]>`
          select proposal.status,
            (select count(*)::integer from public.private_room_blocks block
              where block.idempotency_key = ${`proposal:${proposal!.id}`}) as block_count
          from public.room_action_proposals proposal
          where proposal.id = ${proposal!.id}
        `;
        expect(result).toEqual({ status: "pending", block_count: 0 });
      } finally {
        await db`delete from public.homes where id = ${data.homeId}`;
      }
    },
    DB_TEST_TIMEOUT_MS,
  );
});
