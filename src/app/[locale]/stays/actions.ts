"use server";

import { z } from "zod";
import { guestSessionOptionInput } from "@/core/booking/guest-action-input";
import { optionWindowIsAllowed } from "@/core/booking/option-window";
import { discoverPublicListings } from "@/core/booking/public-listings";
import { searchPublicStays } from "@/core/booking/public-stay-search";

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

export async function lookupHouseholds(name: unknown) {
  const query = z.string().trim().min(2).max(80).safeParse(name);
  if (!query.success)
    return { status: "invalid" as const, listings: [], truncated: false };
  try {
    return {
      status: "success" as const,
      ...(await discoverPublicListings(query.data)),
    };
  } catch (error) {
    console.error("[PUBLIC_LISTING_SEARCH_FAILED]", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "unavailable" as const, listings: [], truncated: false };
  }
}

export async function lookupStays(input: unknown) {
  const parsed = stayQuery.safeParse(input);
  if (!parsed.success)
    return { status: "invalid" as const, options: [], truncated: false };
  const { handle, ...criteria } = parsed.data;
  try {
    return await searchPublicStays(handle, criteria);
  } catch (error) {
    console.error("[PUBLIC_STAY_SEARCH_FAILED]", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "unavailable" as const, options: [], truncated: false };
  }
}
