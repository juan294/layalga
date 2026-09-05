"use server";

import { revalidatePath } from "next/cache";
import { getDatabaseConnection } from "@/core/db/client";
import {
  householdPolicyInput,
  PolicyVersionConflictError,
  updateHouseholdPolicy,
  type HouseholdPolicy,
} from "@/core/policy/settings";
import { requireHost } from "@/lib/auth/current-host";
import { reportActionError } from "@/lib/server/action-errors";

export type PolicySettingsState =
  | { status: "idle" }
  | { status: "saved"; policy: HouseholdPolicy }
  | { status: "error"; error: "invalid" | "stale" | "failed" };

export async function updateHouseholdPolicyAction(
  _previous: PolicySettingsState,
  formData: FormData,
): Promise<PolicySettingsState> {
  const locale = formData.get("locale") === "es" ? "es" : "en";
  const host = await requireHost(locale);
  const parsed = householdPolicyInput.safeParse({
    expectedVersion: Number(formData.get("expectedVersion")),
    petsTogetherAllowed: formData.get("petsTogetherAllowed") === "on",
    maxFamiliesWithChildren: Number(formData.get("maxFamiliesWithChildren")),
  });
  if (!parsed.success) return { status: "error", error: "invalid" };
  try {
    const policy = await updateHouseholdPolicy(getDatabaseConnection().db, {
      ...parsed.data,
      homeId: host.homeId,
      hostId: host.id,
    });
    revalidatePath(`/${locale}`);
    return { status: "saved", policy };
  } catch (error) {
    if (error instanceof PolicyVersionConflictError)
      return { status: "error", error: "stale" };
    reportActionError("household_policy_update_failed", error);
    return { status: "error", error: "failed" };
  }
}
