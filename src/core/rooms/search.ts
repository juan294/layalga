import "@/core/server-only";

import type { Clock } from "@/core/clock";
import { sqlClient, type DatabaseClient } from "@/core/db/client";
import type { HouseState } from "@/core/policy/evaluate-overlap";
import type {
  RoomInventoryState,
  RoomOverflowPolicy,
  StayRange,
} from "@/core/db/schema";

import { resolveGuestRoomOptions } from "./availability";
import type {
  GuestRoomOption,
  RoomAvailabilityOverride,
  RoomDateControl,
  RoomInventoryRecord,
} from "./types";

export interface GuestRoomSearchWindow {
  homeId: string;
  home: HouseState["home"];
  rooms: RoomInventoryRecord[];
  overrides: RoomAvailabilityOverride[];
  occupancies: RoomDateControl[];
  visits: HouseState["visits"];
}

export async function loadGuestRoomSearchWindow(
  database: DatabaseClient,
  clock: Clock,
  homeId: string,
  window: StayRange,
): Promise<GuestRoomSearchWindow> {
  const sql = sqlClient(database);
  const [homeRows, roomRows, overrideRows, occupancyRows, visitRows] =
    await Promise.all([
      sql<
        { pets_together_allowed: boolean; max_families_with_children: number }[]
      >`
        select pets_together_allowed, max_families_with_children
        from public.homes where id = ${homeId}
      `,
      sql<
        {
          id: string;
          guest_label: string | null;
          floor_label: string | null;
          sleeping_arrangement: string | null;
          overflow_arrangement: string | null;
          beds: number | null;
          maximum_capacity: number | null;
          inventory_state: RoomInventoryState;
          overflow_policy: RoomOverflowPolicy;
          display_order: number;
        }[]
      >`
        select id, guest_label, floor_label, sleeping_arrangement,
          overflow_arrangement, beds, maximum_capacity, inventory_state,
          overflow_policy, display_order
        from public.rooms where home_id = ${homeId}
        order by display_order, id
      `,
      sql<
        {
          room_id: string;
          stay_start: string;
          stay_end: string;
          action: "open" | "close";
        }[]
      >`
        select room_id, lower(stay)::text as stay_start,
          upper(stay)::text as stay_end, action
        from public.room_availability_overrides
        where home_id = ${homeId}
          and stay && daterange(${window[0]}::date, ${window[1]}::date, '[)')
      `,
      sql<{ room_id: string; stay_start: string; stay_end: string }[]>`
        select room_id, lower(stay)::text as stay_start,
          upper(stay)::text as stay_end
        from public.visit_rooms
        where home_id = ${homeId}
          and stay && daterange(${window[0]}::date, ${window[1]}::date, '[)')
      `,
      sql<
        {
          id: string;
          stay_start: string;
          stay_end: string;
          adults: number;
          children: number;
          pets: number;
          status: HouseState["visits"][number]["status"];
          room_ids: string[];
        }[]
      >`
        select visit.id, lower(visit.stay)::text as stay_start,
          upper(visit.stay)::text as stay_end, visit.adults, visit.children,
          visit.pets, visit.status,
          coalesce(array_agg(occupancy.room_id)
            filter (where occupancy.room_id is not null), '{}') as room_ids
        from public.visits visit
        left join public.visit_rooms occupancy on occupancy.visit_id = visit.id
        where visit.home_id = ${homeId}
          and visit.status <> 'cancelled'
          and (visit.status <> 'hold' or visit.hold_expires_at > ${clock.now().toISOString()})
          and visit.stay && daterange(${window[0]}::date, ${window[1]}::date, '[)')
        group by visit.id
      `,
    ]);
  const home = homeRows[0];
  if (!home) throw new Error(`Home not found: ${homeId}`);
  return {
    homeId,
    home: {
      petsTogetherAllowed: home.pets_together_allowed,
      maxFamiliesWithChildren: home.max_families_with_children,
    },
    rooms: roomRows.map((room) => ({
      id: room.id,
      homeId,
      guestLabel: room.guest_label,
      floorLabel: room.floor_label,
      sleepingArrangement: room.sleeping_arrangement,
      overflowArrangement: room.overflow_arrangement,
      standardCapacity: room.beds,
      maximumCapacity: room.maximum_capacity,
      inventoryState: room.inventory_state,
      overflowPolicy: room.overflow_policy,
      displayOrder: room.display_order,
    })),
    overrides: overrideRows.map((control) => ({
      homeId,
      roomId: control.room_id,
      stay: [control.stay_start, control.stay_end],
      action: control.action,
    })),
    occupancies: occupancyRows.map((occupancy) => ({
      homeId,
      roomId: occupancy.room_id,
      stay: [occupancy.stay_start, occupancy.stay_end],
    })),
    visits: visitRows.map((visit) => ({
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

export function roomOptionsForStay(
  window: GuestRoomSearchWindow,
  stay: StayRange,
): GuestRoomOption[] {
  return resolveGuestRoomOptions({
    homeId: window.homeId,
    stay,
    rooms: window.rooms,
    overrides: window.overrides,
    occupancies: window.occupancies,
  });
}
