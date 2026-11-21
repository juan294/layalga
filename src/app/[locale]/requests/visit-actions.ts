"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  guestChangeMessage,
  type GuestChangeState,
} from "@/core/booking/guest-action-input";
import {
  requestGuestChangeCore,
  reconfirmGuestCore,
} from "@/core/booking/guest-actions";
import { loadRequestedVisit } from "@/core/booking/requested-visit";
import { verifiedRequester } from "@/lib/auth/verified-requester";
import type { AppLocale } from "@/i18n/routing";

async function authorizedVisit(id: string, locale: AppLocale) {
  if (!z.uuid().safeParse(id).success) return null;
  const requester = await verifiedRequester();
  return requester ? loadRequestedVisit(requester.userId, id, locale) : null;
}

export async function changeRequestedVisit(
  id: string,
  previous: GuestChangeState,
  form: FormData,
): Promise<GuestChangeState> {
  const locale = form.get("locale") === "es" ? "es" : "en";
  const input = guestChangeMessage(form);
  if ("status" in input) return input;
  const invitation = await authorizedVisit(id, locale);
  if (!invitation?.visit?.preArrival || invitation.visit.status === "cancelled")
    return previous;
  const outcome = await requestGuestChangeCore(
    invitation,
    input.message,
    locale,
  );
  if (!outcome) return previous;
  const path = `/${locale}/requests/${id}`;
  if (outcome.cancellationRequested)
    redirect(path + "?cancel=review#cancel-request");
  redirect(
    `/${locale}/runs/${outcome.runId}/status?returnTo=${encodeURIComponent(path)}`,
  );
}

export async function reconfirmRequestedVisit(id: string, form: FormData) {
  const locale = form.get("locale") === "es" ? "es" : "en";
  const invitation = await authorizedVisit(id, locale);
  if (
    invitation?.visit?.preArrival &&
    invitation.visit.status === "reconfirm_pending" &&
    (await reconfirmGuestCore(invitation))
  )
    redirect(`/${locale}/requests/${id}`);
}
