import { withoutTrailingSlash } from "@/core/assistant-access/audience";
import type { StayQuery } from "@/core/booking/guest-lookup";
import type {
  PublicRoomChoice,
  PublicStayOption,
} from "@/core/booking/public-stay-search";
import type { StayRequestReceipt } from "@/core/booking/stay-requests";
import { staySearchKeys } from "@/lib/auth/safe-next-path";

// Strict projections: each field that reaches an assistant vendor is named
// here, so a new field in a core type stays out until this file changes.

const REQUEST_LIMIT = 20;

const staysPage = (appUrl: string, handle: string) =>
  `${withoutTrailingSlash(appUrl)}/stays/${handle.toLowerCase()}`;

export function householdsAnswer(
  result: {
    listings: readonly { handle: string; displayName: string }[];
    truncated: boolean;
  },
  appUrl: string,
) {
  return {
    households: result.listings.map((listing) => ({
      handle: listing.handle,
      name: listing.displayName,
      pageUrl: staysPage(appUrl, listing.handle),
    })),
    truncated: result.truncated,
  };
}

/** The terms that a guest reads, under the names of this answer. */
function roomRow(room: PublicRoomChoice) {
  return {
    name: room.guestLabel,
    floor: room.floorLabel,
    sleepingArrangement: room.sleepingArrangement,
    overflowArrangement: room.overflowArrangement,
    standardCapacity: room.standardCapacity,
    maximumCapacity: room.maximumCapacity,
  };
}

/**
 * Room references are not returned: no assistant tool accepts them. A label
 * such as `r1` names one set of room terms inside this answer only.
 */
export function staysAnswer(
  result: { options: readonly PublicStayOption[]; truncated: boolean },
  terms: StayQuery,
  appUrl: string,
) {
  const labels = new Map<string, string>();
  const rooms: ({ room: string } & ReturnType<typeof roomRow>)[] = [];
  const label = (room: PublicRoomChoice) => {
    const row = roomRow(room);
    const key = JSON.stringify(row);
    let name = labels.get(key);
    if (!name) {
      name = `r${labels.size + 1}`;
      labels.set(key, name);
      rooms.push({ room: name, ...row });
    }
    return name;
  };
  const stays = result.options.map((option) => {
    const byRef = new Map(option.rooms.map((room) => [room.ref, label(room)]));
    return {
      checkIn: option.stay[0],
      checkout: option.stay[1],
      confirmation: option.confirmation,
      rooms: option.rooms.map((room) => byRef.get(room.ref)!),
      recommended: option.recommendedRoomRefs.flatMap((ref) => {
        const name = byRef.get(ref);
        return name ? [name] : [];
      }),
    };
  });
  const search = new URLSearchParams();
  for (const key of staySearchKeys(true))
    search.set(key, String(terms[key as keyof StayQuery]));
  return {
    rooms,
    stays,
    truncated: result.truncated,
    continueUrl: `${staysPage(appUrl, terms.handle)}?${search}`,
  };
}

/** The guest's own requests, as the website orders them: pending first, newest first. */
export function requestsAnswer(
  receipts: readonly StayRequestReceipt[],
  appUrl: string,
) {
  return {
    requests: receipts.slice(0, REQUEST_LIMIT).map((receipt) => ({
      household: receipt.displayName,
      checkIn: receipt.stay[0],
      checkout: receipt.stay[1],
      requestStatus: receipt.status,
      visitStatus: receipt.visitStatus,
    })),
    truncated: receipts.length > REQUEST_LIMIT,
    historyUrl: `${withoutTrailingSlash(appUrl)}/requests`,
  };
}
