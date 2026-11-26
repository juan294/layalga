"use server";

import { verifiedRequester } from "@/lib/auth/verified-requester";
import { findHouseholds, findStays } from "@/core/booking/guest-lookup";

export async function hasStaySession() {
  return Boolean(await verifiedRequester());
}

const signIn = {
  status: "sign_in",
  next: "Reopen this booking page, choose Continue with Google, then retry.",
  truncated: false,
} as const;

export async function lookupHouseholds(name: unknown) {
  try {
    if (!(await hasStaySession())) return { ...signIn, listings: [] };
    return await findHouseholds(name);
  } catch (error) {
    console.error("[PUBLIC_LISTING_SEARCH_FAILED]", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "unavailable" as const, listings: [], truncated: false };
  }
}

export async function lookupStays(input: unknown) {
  try {
    if (!(await hasStaySession())) return { ...signIn, options: [] };
    return await findStays(input);
  } catch (error) {
    console.error("[PUBLIC_STAY_SEARCH_FAILED]", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "unavailable" as const, options: [], truncated: false };
  }
}
