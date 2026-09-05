import type { GuestRoomOption } from "./types";

export const ROOM_PREFERENCES = [
  "ground_floor",
  "upper_floor",
  "separate_beds",
  "double_bed",
] as const;
export type RoomPreference = (typeof ROOM_PREFERENCES)[number];
export interface RoomPreferenceRecall {
  status:
    "available" | "off" | "empty" | "unavailable" | "unusable" | "conflicting";
  preferences: RoomPreference[];
}
export interface RoomPreferenceExplanation {
  status: RoomPreferenceRecall["status"];
  matched: RoomPreference[];
  unmatched: RoomPreference[];
}
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Exact guest-safe room facts only. A floor label is not an accessibility claim. */
export function roomMatchesPreference(
  room: GuestRoomOption,
  preference: RoomPreference,
): boolean {
  const floor = normalize(room.floorLabel),
    beds = normalize(room.sleepingArrangement);
  switch (preference) {
    case "ground_floor":
      return /^(ground|ground floor|planta baja|bajo)$/.test(floor);
    case "upper_floor":
      return /^(upper|upper floor|upstairs|planta alta|primera planta|primer piso)$/.test(
        floor,
      );
    case "separate_beds":
      return /^(separate beds|twin beds|two single beds|2 single beds|two separate beds|camas separadas|dos camas individuales|2 camas individuales)$/.test(
        beds,
      );
    case "double_bed":
      return /^(double bed|a double bed|one double bed|1 double bed|cama doble|una cama doble|cama de matrimonio|una cama de matrimonio)$/.test(
        beds,
      );
  }
}
export function preferenceMask(
  rooms: readonly GuestRoomOption[],
  preferences: readonly RoomPreference[],
): number {
  let mask = 0;
  for (const room of rooms)
    for (const preference of preferences) {
      if (roomMatchesPreference(room, preference))
        mask |= 1 << ROOM_PREFERENCES.indexOf(preference);
    }
  return mask;
}
export function explainRoomPreferences(
  recall: RoomPreferenceRecall,
  recommendedRooms: readonly GuestRoomOption[],
): RoomPreferenceExplanation {
  if (recall.status !== "available")
    return { status: recall.status, matched: [], unmatched: [] };
  const preferences = [...new Set(recall.preferences)];
  return {
    status: recall.status,
    matched: preferences.filter((preference) =>
      recommendedRooms.some((room) => roomMatchesPreference(room, preference)),
    ),
    unmatched: preferences.filter(
      (preference) =>
        !recommendedRooms.some((room) =>
          roomMatchesPreference(room, preference),
        ),
    ),
  };
}
