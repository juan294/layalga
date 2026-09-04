"use server";

import { redirect } from "next/navigation";

import { MAX_GUEST_MESSAGE_LENGTH } from "@/agent/task-limits";
import {
  guestSubmitFormValue,
  guestTokenOptionInput,
  guestTokenSubmitInput,
} from "@/core/booking/guest-action-input";
import {
  findGuestOptionsForAuthority,
  reconfirmGuestCore,
  requestGuestChangeCore,
  submitGuestVisitForAuthority,
  type GuestOptionState,
  type GuestSubmitState,
} from "@/core/booking/guest-actions";
import {
  loadGuestInvitation,
  resolveGuestInvitationAuthority,
} from "@/core/booking/guest-invitation";
import {
  reportActionError,
  reportedActionError,
} from "@/lib/server/action-errors";
import { isRedirectError } from "@/lib/server/redirect-error";

export type {
  GuestOption,
  GuestOptionState,
  GuestSearchCriteria,
  GuestSubmitState,
} from "@/core/booking/guest-actions";

export async function findGuestOptions(
  _previous: GuestOptionState,
  formData: FormData,
): Promise<GuestOptionState> {
  const parsed = guestTokenOptionInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.from >= parsed.data.to) {
    return { status: "error", options: [], error: "invalid" };
  }

  try {
    const authority = await resolveGuestInvitationAuthority({
      token: parsed.data.token,
    });
    if (!authority) {
      return { status: "error", options: [], error: "not_found" };
    }
    return await findGuestOptionsForAuthority(authority, parsed.data);
  } catch (error) {
    reportActionError("guest_options_failed", error);
    return { status: "error", options: [], error: "invalid" };
  }
}

export async function submitGuestVisit(
  _previous: GuestSubmitState,
  formData: FormData,
): Promise<GuestSubmitState> {
  const parsed = guestTokenSubmitInput.safeParse(
    guestSubmitFormValue(formData),
  );
  if (!parsed.success) return { status: "error", error: "invalid" };

  const authority = await resolveGuestInvitationAuthority({
    token: parsed.data.token,
  });
  if (!authority) return { status: "error", error: "not_found" };

  try {
    const { runId } = await submitGuestVisitForAuthority(
      authority,
      parsed.data,
    );
    redirect(
      `/${parsed.data.locale}/runs/${runId}/status?returnTo=${encodeURIComponent(
        `/${parsed.data.locale}/g/${parsed.data.token}`,
      )}&token=${encodeURIComponent(parsed.data.token)}`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    reportActionError("guest_submit_failed", error);
    return { status: "error", error: "failed" };
  }
}

export async function requestGuestChange(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const locale = formData.get("locale") === "es" ? "es" : "en";
  const message = String(formData.get("message") ?? "").trim();
  if (message.length > MAX_GUEST_MESSAGE_LENGTH) return;
  try {
    const invitation = await loadGuestInvitation({ token }, locale);
    if (!invitation) return;
    const result = await requestGuestChangeCore(invitation, message, locale);
    if (!result) return;
    redirect(
      `/${locale}/runs/${result.runId}/status?returnTo=${encodeURIComponent(
        `/${locale}/g/${token}`,
      )}&token=${encodeURIComponent(token)}`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    throw reportedActionError("guest_change_failed", error);
  }
}

export async function reconfirmGuest(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const locale = formData.get("locale") === "es" ? "es" : "en";
  try {
    const invitation = await loadGuestInvitation({ token }, locale);
    if (!invitation) return;
    const applied = await reconfirmGuestCore(invitation);
    if (!applied) return;
    redirect(`/${locale}/g/${token}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    throw reportedActionError("guest_reconfirm_failed", error);
  }
}
