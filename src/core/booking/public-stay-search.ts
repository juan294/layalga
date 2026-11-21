import "@/core/server-only";
import type { TransactionSql } from "postgres";
import { SystemClock, type Clock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import type { StayRange } from "@/core/db/schema";
import { MAX_ROOM_SELECTION } from "@/core/rooms/limits";
import { evaluateRoomSelection } from "@/core/rooms/occupancy";
import { loadGuestRoomSearchWindow } from "@/core/rooms/search";
import type { GuestRoomOption } from "@/core/rooms/types";
import { guestSessionOptionInput } from "./guest-action-input";
import { toGuestRoomChoice, type GuestRoomChoice } from "./guest-room-contract";
import { hashLinkToken } from "./link-tokens";
import { resolvePublicListing } from "./public-listings";
import { enumerateStayOptions, type GuestSearchCriteria } from "./stay-options";

const PUBLIC_OPTION_LIMIT = 12;

export type PublicRoomChoice = Omit<GuestRoomChoice, "id"> & { ref: string };

export interface PublicStayOption {
  confirmation: "host_approval_required";
  stay: StayRange;
  rooms: PublicRoomChoice[];
  recommendedRoomRefs: string[];
}

export interface PublicStaySearchResult {
  status: "success" | "invalid" | "not_found" | "none";
  options: PublicStayOption[];
  truncated: boolean;
}

async function loadPublicSearch(
  handle: string,
  criteria: GuestSearchCriteria,
  transaction?: TransactionSql,
  clock: Clock = new SystemClock(),
) {
  const listing = await resolvePublicListing(handle, transaction);
  if (!listing) return { status: "not_found" } as const;

  const counts = [
    criteria?.adults,
    criteria?.children,
    criteria?.pets,
    criteria?.nights,
  ];
  if (!counts.every(Number.isInteger)) return { status: "invalid" } as const;
  const parsed = guestSessionOptionInput.safeParse({
    ...criteria,
    locale: "en",
  });
  if (!parsed.success) return { status: "invalid" } as const;
  const input = parsed.data;
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: listing.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(clock.now());
  if (
    input.from < today ||
    Date.parse(input.to) - Date.parse(input.from) < input.nights * 86_400_000
  ) {
    return { status: "invalid" } as const;
  }

  const window = await loadGuestRoomSearchWindow(
    transaction ?? getDatabaseConnection().db,
    clock,
    listing.homeId,
    [input.from, input.to],
  );
  return {
    status: "success",
    listing,
    options: enumerateStayOptions(window, input, []),
  } as const;
}

function publicRoom(
  listing: { handle: string; homeId: string },
  stay: StayRange,
  room: GuestRoomOption,
): PublicRoomChoice {
  const { id, ...terms } = toGuestRoomChoice(room);
  // A change to the dates or displayed terms requires a new guest selection.
  // Possession of a reference alone grants no access or reservation.
  const ref = hashLinkToken(
    JSON.stringify([
      "public-room-v1",
      listing.homeId,
      listing.handle,
      stay,
      id,
      terms,
    ]),
    process.env.LINK_TOKEN_SECRET ?? "",
  );
  return { ref, ...terms };
}

export async function searchPublicStays(
  handle: string,
  criteria: GuestSearchCriteria,
  project?: (option: PublicStayOption) => PublicStayOption | null,
): Promise<PublicStaySearchResult> {
  const search = await loadPublicSearch(handle, criteria);
  const options: PublicStayOption[] = [];
  if (search.status !== "success")
    return { status: search.status, options, truncated: false };
  for (const option of search.options) {
    const byId = new Map(
      option.rooms.map((room) => [
        room.id,
        publicRoom(search.listing, option.stay, room),
      ]),
    );
    const candidate: PublicStayOption = {
      confirmation: "host_approval_required",
      stay: option.stay,
      rooms: [...byId.values()],
      recommendedRoomRefs: option.recommended.map(
        (room) => byId.get(room.id)!.ref,
      ),
    };
    const visible = project ? project(candidate) : candidate;
    if (!visible) continue;
    if (options.length === PUBLIC_OPTION_LIMIT)
      return { status: "success", options, truncated: true };
    options.push(visible);
  }
  return {
    status: options.length ? "success" : "none",
    options,
    truncated: false,
  };
}

/** Server-only. Re-read publication and inventory before accepting a reviewed selection. */
export async function resolvePublicStaySelection(
  handle: string,
  exactCriteria: GuestSearchCriteria,
  roomRefs: readonly string[],
  overflowConsent: boolean,
  transaction?: TransactionSql,
  clock: Clock = new SystemClock(),
): Promise<{
  homeId: string;
  displayName: string;
  roomIds: string[];
  rooms: PublicRoomChoice[];
} | null> {
  if (
    !Array.isArray(roomRefs) ||
    !roomRefs.length ||
    roomRefs.length > MAX_ROOM_SELECTION
  )
    return null;
  const search = await loadPublicSearch(
    handle,
    exactCriteria,
    transaction,
    clock,
  );
  if (search.status !== "success") return null;
  const option = search.options.next().value;
  if (
    !option ||
    option.stay[0] !== exactCriteria.from ||
    option.stay[1] !== exactCriteria.to
  )
    return null;
  const byRef = new Map(
    option.rooms.map((room) => [
      publicRoom(search.listing, option.stay, room).ref,
      room.id,
    ]),
  );
  const roomIds: string[] = [];
  for (const ref of roomRefs) {
    const roomId = byRef.get(ref);
    if (!roomId) return null;
    roomIds.push(roomId);
  }
  const verdict = evaluateRoomSelection(
    roomIds,
    option.rooms,
    exactCriteria.adults + exactCriteria.children,
    overflowConsent === true,
  );
  if (verdict.decision === "deny") return null;
  return {
    homeId: search.listing.homeId,
    displayName: search.listing.displayName,
    rooms: verdict.rooms.map((room) =>
      publicRoom(search.listing, option.stay, room),
    ),
    roomIds: verdict.rooms.map((room) => room.id),
  };
}
