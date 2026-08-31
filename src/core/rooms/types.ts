import type {
  RoomInventoryState,
  RoomOverflowPolicy,
  StayRange,
} from "@/core/db/schema";

export interface GuestRoomOption {
  id: string;
  guestLabel: string;
  floorLabel: string;
  sleepingArrangement: string;
  overflowArrangement: string | null;
  standardCapacity: number;
  maximumCapacity: number;
  overflowPolicy: RoomOverflowPolicy;
  displayOrder: number;
}

export interface RoomInventoryRecord {
  id: string;
  homeId: string;
  guestLabel: string | null;
  floorLabel: string | null;
  sleepingArrangement: string | null;
  overflowArrangement: string | null;
  standardCapacity: number | null;
  maximumCapacity: number | null;
  inventoryState: RoomInventoryState;
  overflowPolicy: RoomOverflowPolicy;
  displayOrder: number;
  privateNotes?: string | null;
}

export interface RoomDateControl {
  roomId: string;
  homeId: string;
  stay: StayRange;
}

export interface RoomAvailabilityOverride extends RoomDateControl {
  action: "open" | "close";
}

export type RoomSelectionVerdict =
  | {
      decision: "allow";
      reason: undefined;
      rooms: GuestRoomOption[];
      usesOverflow: false;
      overflowArrangements: [];
    }
  | {
      decision: "interrupt";
      reason: "overflow";
      rooms: GuestRoomOption[];
      usesOverflow: true;
      overflowArrangements: string[];
    }
  | {
      decision: "deny";
      reason: "selection" | "capacity" | "overflow";
      rooms: readonly [];
      usesOverflow: false;
      overflowArrangements: readonly [];
    };
