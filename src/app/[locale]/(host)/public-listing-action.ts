"use server";

import { revalidatePath } from "next/cache";
import {
  setPublicListing,
  validListingName,
} from "@/core/booking/public-listings";
import { requireHost } from "@/lib/auth/current-host";
import { reportActionError } from "@/lib/server/action-errors";

export type PublicListingState = "idle" | "saved" | "invalid" | "failed";

export async function updatePublicListingAction(
  _previous: PublicListingState,
  form: FormData,
): Promise<PublicListingState> {
  const locale = form.get("locale") === "es" ? "es" : "en";
  const host = await requireHost(locale);
  const mode = form.get("mode");
  const name = form.get("displayName");
  if (mode !== "publish" && mode !== "unpublish") return "invalid";
  if (
    mode === "publish" &&
    (typeof name !== "string" || !validListingName(name))
  )
    return "invalid";
  try {
    await setPublicListing(
      { id: host.id, homeId: host.homeId },
      mode === "publish"
        ? { published: true, displayName: String(name) }
        : { published: false },
    );
    revalidatePath(`/${locale}/settings`);
    return "saved";
  } catch (error) {
    reportActionError("public_listing_update_failed", error);
    return "failed";
  }
}
