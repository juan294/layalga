import "@/core/server-only";

import { z } from "zod";

import { guestSessionOptionInput } from "./guest-action-input";
import { optionWindowIsAllowed } from "./option-window";
import { discoverPublicListings } from "./public-listings";
import {
  searchPublicStays,
  type PublicStaySearchResult,
} from "./public-stay-search";

// Browser forms send decimal strings. Agent calls also accept JSON numbers.
// Gate the wire types before the shared domain fields coerce and bound them.
const fields = guestSessionOptionInput.shape;
const count = (bounds: typeof fields.nights) =>
  z.preprocess(
    (value) =>
      typeof value === "number" ||
      (typeof value === "string" && /^\d+$/.test(value))
        ? value
        : Number.NaN,
    bounds,
  );
const stayQuery = z
  .strictObject({
    handle: z.uuid(),
    from: fields.from,
    to: fields.to,
    nights: count(fields.nights),
    adults: count(fields.adults),
    children: count(fields.children),
    pets: count(fields.pets),
  })
  .refine(({ from, to }) => optionWindowIsAllowed(from, to));

export type StayQuery = z.infer<typeof stayQuery>;

/**
 * Published households whose name contains `name`. Callers check the session
 * first; a database failure propagates to them.
 */
export async function findHouseholds(name: unknown) {
  const query = z.string().trim().min(2).max(80).safeParse(name);
  if (!query.success)
    return { status: "invalid" as const, listings: [], truncated: false };
  return {
    status: "success" as const,
    ...(await discoverPublicListings(query.data)),
  };
}

/** Whole stays of one published household. A database failure propagates. */
export async function findStays(
  input: unknown,
): Promise<PublicStaySearchResult> {
  const parsed = stayQuery.safeParse(input);
  if (!parsed.success)
    return { status: "invalid", options: [], truncated: false };
  const { handle, ...criteria } = parsed.data;
  return searchPublicStays(handle, criteria);
}
