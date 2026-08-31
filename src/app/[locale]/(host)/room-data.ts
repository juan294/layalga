import "@/core/server-only";

import type { DatabaseClient } from "@/core/db/client";
import { sqlClient } from "@/core/db/client";
import type { RoomInventoryState, RoomOverflowPolicy } from "@/core/db/schema";

export type DoorState =
  | "available"
  | "occupied"
  | "private"
  | "closed"
  | "withheld"
  | "inactive"
  | "draft";

export interface HostRoomItem {
  id: string;
  name: string;
  guestLabel: string;
  floorLabel: string;
  sleepingArrangement: string;
  overflowArrangement: string | null;
  standardCapacity: number;
  maximumCapacity: number;
  inventoryState: RoomInventoryState;
  overflowPolicy: RoomOverflowPolicy;
  displayOrder: number;
  privateNotes: string | null;
  doorState: DoorState;
  doorStates: DoorState[];
}

export interface HostRoomOverride {
  id: string;
  roomId: string;
  roomLabel: string;
  action: "open" | "close";
  start: string;
  end: string;
  privateNote: string | null;
}

export interface HostPrivateBlock {
  id: string;
  start: string;
  end: string;
  publicLabel: string;
  privateNote: string | null;
  roomLabels: string[];
}

export interface HostRoomProposal {
  id: string;
  kind: "private_block" | "open" | "close";
  start: string;
  end: string;
  summary: string;
  roomLabels: string[];
}

export interface HostCalendarFeed {
  id: string;
  label: string;
  locale: "en" | "es";
}

export interface HostRoomLedgerData {
  rooms: HostRoomItem[];
  overrides: HostRoomOverride[];
  blocks: HostPrivateBlock[];
  proposals: HostRoomProposal[];
  feeds: HostCalendarFeed[];
}

export async function loadHostRoomLedger(
  database: DatabaseClient,
  homeId: string,
  window: readonly [string, string],
): Promise<HostRoomLedgerData> {
  const sql = sqlClient(database);
  const [rooms, overrides, blocks, proposals, feeds] = await Promise.all([
    sql<
      {
        id: string;
        name: string;
        guest_label: string | null;
        floor_label: string | null;
        sleeping_arrangement: string | null;
        overflow_arrangement: string | null;
        beds: number | null;
        maximum_capacity: number | null;
        inventory_state: RoomInventoryState;
        overflow_policy: RoomOverflowPolicy;
        display_order: number;
        private_notes: string | null;
        occupied: boolean;
        private_blocked: boolean;
        closed: boolean;
        opened: boolean;
      }[]
    >`
      select room.*,
        exists (
          select 1 from public.visit_rooms occupancy
          where occupancy.room_id = room.id
            and occupancy.visit_id is not null
            and occupancy.stay && daterange(${window[0]}::date, ${window[1]}::date, '[)')
        ) as occupied,
        exists (
          select 1 from public.visit_rooms occupancy
          where occupancy.room_id = room.id
            and occupancy.private_block_id is not null
            and occupancy.stay && daterange(${window[0]}::date, ${window[1]}::date, '[)')
        ) as private_blocked,
        exists (
          select 1 from public.room_availability_overrides control
          where control.room_id = room.id and control.action = 'close'
            and control.stay && daterange(${window[0]}::date, ${window[1]}::date, '[)')
        ) as closed,
        exists (
          select 1 from public.room_availability_overrides control
          where control.room_id = room.id and control.action = 'open'
            and control.stay && daterange(${window[0]}::date, ${window[1]}::date, '[)')
        ) as opened
      from public.rooms room
      where room.home_id = ${homeId}
      order by room.display_order, room.id
    `,
    sql<
      {
        id: string;
        room_id: string;
        room_label: string;
        action: "open" | "close";
        stay_start: string;
        stay_end: string;
        private_note: string | null;
      }[]
    >`
      select control.id, control.room_id,
        coalesce(room.guest_label, room.name) as room_label,
        control.action, lower(control.stay)::text as stay_start,
        upper(control.stay)::text as stay_end, control.private_note
      from public.room_availability_overrides control
      join public.rooms room on room.id = control.room_id
      where control.home_id = ${homeId}
        and control.stay && daterange(${window[0]}::date, ${window[1]}::date, '[)')
      order by lower(control.stay), room.display_order, control.id
    `,
    sql<
      {
        id: string;
        stay_start: string;
        stay_end: string;
        public_label: string;
        private_note: string | null;
        room_labels: string[];
      }[]
    >`
      select block.id, lower(block.stay)::text as stay_start,
        upper(block.stay)::text as stay_end, block.public_label,
        block.private_note,
        array_agg(coalesce(room.guest_label, room.name)
          order by room.display_order, room.id) as room_labels
      from public.private_room_blocks block
      join public.visit_rooms occupancy on occupancy.private_block_id = block.id
      join public.rooms room on room.id = occupancy.room_id
      where block.home_id = ${homeId} and block.status = 'active'
        and block.stay && daterange(${window[0]}::date, ${window[1]}::date, '[)')
      group by block.id
      order by lower(block.stay), block.id
    `,
    sql<
      {
        id: string;
        kind: "private_block" | "open" | "close";
        stay_start: string;
        stay_end: string;
        summary: string;
        room_labels: string[];
      }[]
    >`
      select proposal.id, proposal.kind,
        lower(proposal.stay)::text as stay_start,
        upper(proposal.stay)::text as stay_end, proposal.summary,
        array_agg(coalesce(room.guest_label, room.name)
          order by room.display_order, room.id) as room_labels
      from public.room_action_proposals proposal
      join public.room_action_proposal_rooms link
        on link.proposal_id = proposal.id and link.home_id = proposal.home_id
      join public.rooms room on room.id = link.room_id
      where proposal.home_id = ${homeId} and proposal.status = 'pending'
      group by proposal.id
      order by proposal.created_at, proposal.id
    `,
    sql<{ id: string; label: string; locale: "en" | "es" }[]>`
      select id, label, locale
      from public.calendar_feeds
      where home_id = ${homeId} and revoked_at is null
      order by created_at, id
    `,
  ]);

  return {
    rooms: rooms.map((room) => {
      const states = doorStates(room);
      return {
        id: room.id,
        name: room.name,
        guestLabel: room.guest_label ?? "",
        floorLabel: room.floor_label ?? "",
        sleepingArrangement: room.sleeping_arrangement ?? "",
        overflowArrangement: room.overflow_arrangement,
        standardCapacity: room.beds ?? 1,
        maximumCapacity: room.maximum_capacity ?? room.beds ?? 1,
        inventoryState: room.inventory_state,
        overflowPolicy: room.overflow_policy,
        displayOrder: room.display_order,
        privateNotes: room.private_notes,
        doorState: states[0],
        doorStates: states,
      };
    }),
    overrides: overrides.map((control) => ({
      id: control.id,
      roomId: control.room_id,
      roomLabel: control.room_label,
      action: control.action,
      start: control.stay_start,
      end: control.stay_end,
      privateNote: control.private_note,
    })),
    blocks: blocks.map((block) => ({
      id: block.id,
      start: block.stay_start,
      end: block.stay_end,
      publicLabel: block.public_label,
      privateNote: block.private_note,
      roomLabels: block.room_labels,
    })),
    proposals: proposals.map((proposal) => ({
      id: proposal.id,
      kind: proposal.kind,
      start: proposal.stay_start,
      end: proposal.stay_end,
      summary: proposal.summary,
      roomLabels: proposal.room_labels,
    })),
    feeds,
  };
}

function doorStates(room: {
  occupied: boolean;
  private_blocked: boolean;
  closed: boolean;
  opened: boolean;
  inventory_state: RoomInventoryState;
}): DoorState[] {
  const states: DoorState[] = [];
  if (room.private_blocked) states.push("private");
  if (room.occupied) states.push("occupied");
  if (room.closed) states.push("closed");
  if (room.inventory_state === "withheld") states.push("withheld");
  if (room.opened || room.inventory_state === "available")
    states.push("available");
  if (room.inventory_state === "inactive") states.push("inactive");
  if (room.inventory_state === "draft") states.push("draft");
  return states;
}
