import "@/core/server-only";

import type { TransactionSql } from "postgres";

import { validateDateStay } from "@/core/date-stay";
import type { DatabaseClient } from "@/core/db/client";
import type { RoomInventoryState, StayRange } from "@/core/db/schema";

import type {
  GuestRoomOption,
  GuestSafeRoomInventory,
  RoomAvailabilityOverride,
  RoomDateControl,
  RoomInventoryRecord,
} from "./types";

interface GuestRoomRow {
  id: string;
  guest_label: string | null;
  floor_label: string | null;
  sleeping_arrangement: string | null;
  overflow_arrangement: string | null;
  beds: number | null;
  maximum_capacity: number | null;
  inventory_state: RoomInventoryState;
  overflow_policy: GuestRoomOption["overflowPolicy"];
  display_order: number;
}

export async function listGuestSafeRoomInventory(
  database: DatabaseClient | TransactionSql,
  homeId: string,
  limit = 21,
): Promise<GuestSafeRoomInventory[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Room inventory limit must be between 1 and 100");
  }
  const sql = "$client" in database ? database.$client : database;
  const rows = await sql<GuestRoomRow[]>`
    select
      id, guest_label, floor_label, sleeping_arrangement,
      overflow_arrangement, beds, maximum_capacity, inventory_state,
      overflow_policy, display_order
    from public.rooms
    where home_id = ${homeId}
      and inventory_state in ('available', 'withheld')
      and guest_label is not null
      and floor_label is not null
      and sleeping_arrangement is not null
      and beds is not null
      and maximum_capacity is not null
    order by display_order, id
    limit ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    guestLabel: row.guest_label!,
    floorLabel: row.floor_label!,
    sleepingArrangement: row.sleeping_arrangement!,
    overflowArrangement: row.overflow_arrangement,
    standardCapacity: row.beds!,
    maximumCapacity: row.maximum_capacity!,
    overflowPolicy: row.overflow_policy,
    displayOrder: row.display_order,
    inventoryState: row.inventory_state as "available" | "withheld",
  }));
}

function dateValue(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

function overlaps(left: StayRange, right: StayRange): boolean {
  return (
    dateValue(left[0]) < dateValue(right[1]) &&
    dateValue(right[0]) < dateValue(left[1])
  );
}

function contains(container: StayRange, contained: StayRange): boolean {
  return (
    dateValue(container[0]) <= dateValue(contained[0]) &&
    dateValue(container[1]) >= dateValue(contained[1])
  );
}

export function resolveGuestRoomOptions(input: {
  homeId: string;
  stay: StayRange;
  rooms: readonly RoomInventoryRecord[];
  overrides: readonly RoomAvailabilityOverride[];
  occupancies: readonly RoomDateControl[];
}): GuestRoomOption[] {
  validateDateStay(
    input.stay,
    "Room availability requires a valid half-open stay",
  );

  return input.rooms
    .filter((room) => {
      if (room.homeId !== input.homeId) return false;
      if (
        room.inventoryState !== "available" &&
        room.inventoryState !== "withheld"
      )
        return false;
      if (
        room.guestLabel === null ||
        room.guestLabel.trim() === "" ||
        room.floorLabel === null ||
        room.floorLabel.trim() === "" ||
        room.sleepingArrangement === null ||
        room.sleepingArrangement.trim() === "" ||
        room.standardCapacity === null ||
        !Number.isInteger(room.standardCapacity) ||
        room.standardCapacity <= 0 ||
        room.maximumCapacity === null ||
        !Number.isInteger(room.maximumCapacity) ||
        room.maximumCapacity < room.standardCapacity ||
        (room.maximumCapacity > room.standardCapacity &&
          (room.overflowPolicy !== "host_approval" ||
            !room.overflowArrangement?.trim())) ||
        (room.maximumCapacity === room.standardCapacity &&
          (room.overflowPolicy !== "none" || room.overflowArrangement !== null))
      )
        return false;
      if (
        input.occupancies.some(
          (occupancy) =>
            occupancy.homeId === input.homeId &&
            occupancy.roomId === room.id &&
            overlaps(occupancy.stay, input.stay),
        )
      )
        return false;

      const controls = input.overrides.filter(
        (override) =>
          override.homeId === input.homeId && override.roomId === room.id,
      );
      if (room.inventoryState === "available") {
        return !controls.some(
          (override) =>
            override.action === "close" && overlaps(override.stay, input.stay),
        );
      }
      return controls.some(
        (override) =>
          override.action === "open" && contains(override.stay, input.stay),
      );
    })
    .map((room) => ({
      id: room.id,
      guestLabel: room.guestLabel!,
      floorLabel: room.floorLabel!,
      sleepingArrangement: room.sleepingArrangement!,
      overflowArrangement: room.overflowArrangement,
      standardCapacity: room.standardCapacity!,
      maximumCapacity: room.maximumCapacity!,
      overflowPolicy: room.overflowPolicy,
      displayOrder: room.displayOrder,
    }))
    .sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.id.localeCompare(right.id),
    );
}

export async function listGuestRoomOptions(
  database: DatabaseClient | TransactionSql,
  homeId: string,
  stay: StayRange,
  partySize: number,
  options: { excludeVisitId?: string; limit?: number } = {},
): Promise<GuestRoomOption[]> {
  validateDateStay(stay, "Room availability requires a valid half-open stay");
  if (!Number.isInteger(partySize) || partySize <= 0) {
    throw new RangeError("Party size must be a positive integer");
  }
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 100)
  ) {
    throw new RangeError("Room option limit must be between 1 and 100");
  }

  const sql = "$client" in database ? database.$client : database;
  const rows = await sql<GuestRoomRow[]>`
    select
      room.id,
      room.guest_label,
      room.floor_label,
      room.sleeping_arrangement,
      room.overflow_arrangement,
      room.beds,
      room.maximum_capacity,
      room.inventory_state,
      room.overflow_policy,
      room.display_order
    from public.rooms room
    where room.home_id = ${homeId}
      and room.inventory_state in ('available', 'withheld')
      and room.guest_label is not null
      and room.floor_label is not null
      and room.sleeping_arrangement is not null
      and room.beds is not null
      and room.maximum_capacity is not null
      and not exists (
        select 1
        from public.visit_rooms occupancy
        where occupancy.room_id = room.id
          and occupancy.stay && daterange(${stay[0]}::date, ${stay[1]}::date, '[)')
          and (
            ${options.excludeVisitId ?? null}::uuid is null
            or occupancy.visit_id is distinct from ${options.excludeVisitId ?? null}::uuid
          )
      )
      and (
        (
          room.inventory_state = 'available'
          and not exists (
            select 1
            from public.room_availability_overrides override
            where override.room_id = room.id
              and override.action = 'close'
              and override.stay && daterange(${stay[0]}::date, ${stay[1]}::date, '[)')
          )
        )
        or
        (
          room.inventory_state = 'withheld'
          and exists (
            select 1
            from public.room_availability_overrides override
            where override.room_id = room.id
              and override.action = 'open'
              and override.stay @> daterange(${stay[0]}::date, ${stay[1]}::date, '[)')
          )
        )
    )
    order by room.display_order, room.id
    limit ${options.limit ?? 2_147_483_647}
  `;

  return rows.map((row) => ({
    id: row.id,
    guestLabel: row.guest_label!,
    floorLabel: row.floor_label!,
    sleepingArrangement: row.sleeping_arrangement!,
    overflowArrangement: row.overflow_arrangement,
    standardCapacity: row.beds!,
    maximumCapacity: row.maximum_capacity!,
    overflowPolicy: row.overflow_policy,
    displayOrder: row.display_order,
  }));
}
