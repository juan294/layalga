import type { GuestRoomOption } from "@/core/rooms/types";

export interface GuestRoomChoice {
  id: string;
  guestLabel: string;
  floorLabel: string;
  sleepingArrangement: string;
  overflowArrangement: string | null;
  standardCapacity: number;
  maximumCapacity: number;
}

export function toGuestRoomChoice(room: GuestRoomOption): GuestRoomChoice {
  return {
    id: room.id,
    guestLabel: room.guestLabel,
    floorLabel: room.floorLabel,
    sleepingArrangement: room.sleepingArrangement,
    overflowArrangement: room.overflowArrangement,
    standardCapacity: room.standardCapacity,
    maximumCapacity: room.maximumCapacity,
  };
}
