import type {
  GuestRoomOption,
  GuestSafeRoomInventory,
} from "@/core/rooms/types";

const LABEL_LIMIT = 120;
const ARRANGEMENT_LIMIT = 240;

export function boundedGuestRoom<
  Room extends GuestRoomOption | GuestSafeRoomInventory,
>(room: Room): Room {
  return {
    ...room,
    guestLabel: room.guestLabel.slice(0, LABEL_LIMIT),
    floorLabel: room.floorLabel.slice(0, LABEL_LIMIT),
    sleepingArrangement: room.sleepingArrangement.slice(0, ARRANGEMENT_LIMIT),
    overflowArrangement:
      room.overflowArrangement?.slice(0, ARRANGEMENT_LIMIT) ?? null,
  };
}
