"use server";

import { redirect } from "next/navigation";
import { CancellationChangedError } from "@/core/booking/cancellation-error";
import { cancellationReviewInput } from "@/core/booking/cancellation-input";

import { MAX_GUEST_MESSAGE_LENGTH } from "@/agent/task-limits";
import {
  guestSessionOptionInput,
  guestSessionSubmitInput,
  guestSubmitFormValue,
} from "@/core/booking/guest-action-input";
import {
  cancelGuestInvitationCore,
  findGuestOptionsForAuthority,
  reconfirmGuestCore,
  requestGuestChangeCore,
  submitGuestVisitForAuthority,
  type GuestOptionState,
  type GuestSubmitState,
} from "@/core/booking/guest-actions";
import { loadGuestInvitation } from "@/core/booking/guest-invitation";
import {
  getCurrentGuestInvitation,
  type GuestInvitationRecord,
} from "@/lib/auth/current-guest";
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

export async function findGuestOptionsSession(
  _previous: GuestOptionState,
  formData: FormData,
): Promise<GuestOptionState> {
  const session = await getCurrentGuestInvitation();
  if (!session) {
    return { status: "error", options: [], error: "not_found" };
  }

  const parsed = guestSessionOptionInput.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success || parsed.data.from >= parsed.data.to) {
    return { status: "error", options: [], error: "invalid" };
  }

  try {
    return await findGuestOptionsForAuthority(
      authorityForSession(session),
      parsed.data,
    );
  } catch (error) {
    reportActionError("guest_options_failed", error);
    return { status: "error", options: [], error: "invalid" };
  }
}

export async function submitGuestVisitSession(
  _previous: GuestSubmitState,
  formData: FormData,
): Promise<GuestSubmitState> {
  const session = await getCurrentGuestInvitation();
  if (!session) return { status: "error", error: "not_found" };

  const parsed = guestSessionSubmitInput.safeParse(
    guestSubmitFormValue(formData),
  );
  if (!parsed.success) return { status: "error", error: "invalid" };

  try {
    const { runId } = await submitGuestVisitForAuthority(
      authorityForSession(session),
      parsed.data,
    );
    redirect(
      `/${parsed.data.locale}/runs/${runId}/status?returnTo=${encodeURIComponent(
        `/${parsed.data.locale}/guest`,
      )}`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    reportActionError("guest_submit_failed", error);
    return { status: "error", error: "failed" };
  }
}

export async function requestGuestChangeSession(
  formData: FormData,
): Promise<void> {
  const session = await getCurrentGuestInvitation();
  if (!session) return;

  const locale = formData.get("locale") === "es" ? "es" : "en";
  const message = String(formData.get("message") ?? "").trim();
  if (!message || message.length > MAX_GUEST_MESSAGE_LENGTH) return;
  try {
    const invitation = await loadGuestInvitation(
      { invitationId: session.invitationId },
      locale,
    );
    if (!invitation) return;
    const result = await requestGuestChangeCore(invitation, message, locale);
    if (!result) return;
    if (result.cancellationRequested)
      redirect(`/${locale}/guest?cancel=review#cancel-request`);
    redirect(
      `/${locale}/runs/${result.runId}/status?returnTo=${encodeURIComponent(
        `/${locale}/guest`,
      )}`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    throw reportedActionError("guest_change_failed", error);
  }
}

export async function reconfirmGuestSession(formData: FormData): Promise<void> {
  const session = await getCurrentGuestInvitation();
  if (!session) return;

  const locale = formData.get("locale") === "es" ? "es" : "en";
  try {
    const invitation = await loadGuestInvitation(
      { invitationId: session.invitationId },
      locale,
    );
    if (!invitation) return;
    const applied = await reconfirmGuestCore(invitation);
    if (!applied) return;
    redirect(`/${locale}/guest`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    throw reportedActionError("guest_reconfirm_failed", error);
  }
}

function authorityForSession(session: GuestInvitationRecord) {
  return {
    id: session.invitationId,
    homeId: session.homeId,
    partyId: session.partyId,
  };
}

export async function cancelGuestSession(formData: FormData): Promise<void> {
  const locale = formData.get("locale") === "es" ? "es" : "en";
  const session = await getCurrentGuestInvitation();
  if (!session) return;
  const invitation = await loadGuestInvitation(
    { invitationId: session.invitationId },
    locale,
  );
  if (!invitation) return;
  const review = cancellationReviewInput(formData);
  try {
    await cancelGuestInvitationCore(invitation, review);
  } catch (error) {
    if (error instanceof CancellationChangedError)
      redirect(`/${locale}/guest?cancel=changed#cancel-request`);
    throw error;
  }
  redirect(`/${locale}/cancellation-complete`);
}
