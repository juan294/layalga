import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  cancelPrivateRoomBlock,
  createPrivateRoomBlock,
  createRoomAvailabilityOverride,
  removeRoomAvailabilityOverride,
  RoomOperationIdempotencyError,
} from "./operations";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const db = postgres(connectionUrl, { max: 4, prepare: false });

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

  it("creates one idempotent private block and cancels only its occupancy", async () => {
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

      const cancelled = await cancelPrivateRoomBlock(db, first.id, data.hostId);
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
  });

  it("creates and removes state-compatible date overrides", async () => {
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
  });
});
