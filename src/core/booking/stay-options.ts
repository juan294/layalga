import { evaluateOverlap } from "@/core/policy/evaluate-overlap";
import type { RoomPreference } from "@/core/rooms/preferences";
import { recommendRoomsWithOverflow } from "@/core/rooms/recommendation";
import {
  roomOptionsForStay,
  type GuestRoomSearchWindow,
} from "@/core/rooms/search";
import type { GuestRoomOption } from "@/core/rooms/types";
import type { StayRange } from "@/core/db/schema";

export interface GuestSearchCriteria {
  from: string;
  to: string;
  nights: number;
  adults: number;
  children: number;
  pets: number;
}

interface FeasibleStay {
  stay: StayRange;
  rooms: GuestRoomOption[];
  recommended: GuestRoomOption[];
}

const DAY_MS = 86_400_000;

// Dates here are calendar days. A UTC increment preserves the half-open stay
// across clock changes after the caller has checked the household's local date.
export function* enumerateStayOptions(
  window: GuestRoomSearchWindow,
  input: GuestSearchCriteria,
  preferences: readonly RoomPreference[],
): Generator<FeasibleStay, void> {
  const duration = input.nights * DAY_MS;
  const lastStart = Date.parse(input.to) - duration;
  for (
    let start = Date.parse(input.from);
    start <= lastStart;
    start += DAY_MS
  ) {
    const stay: StayRange = [
      new Date(start).toISOString().slice(0, 10),
      new Date(start + duration).toISOString().slice(0, 10),
    ];
    const rooms = roomOptionsForStay(window, stay);
    const recommendation = recommendRoomsWithOverflow(
      rooms,
      input.adults + input.children,
      preferences,
    );
    if (!recommendation) continue;
    const draft = {
      stay,
      adults: input.adults,
      children: input.children,
      pets: input.pets,
      specialRequests: [],
    };
    const verdict = evaluateOverlap(draft, {
      home: window.home,
      visits: window.visits,
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.guestLabel,
        beds: recommendation.usesOverflow
          ? room.maximumCapacity
          : room.standardCapacity,
      })),
    });
    if (verdict.decision !== "deny")
      yield { stay, rooms, recommended: recommendation.rooms };
  }
}
