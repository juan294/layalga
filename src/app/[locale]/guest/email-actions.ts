"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SystemClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import {
  disableGuestContact,
  GuestContactError,
  registerGuestContact,
  verifyGuestContact,
} from "@/core/notifications/guest-contact";
import {
  resolveGuestContactAuthority,
  type GuestContactContext,
} from "@/lib/auth/guest-contact-authority";
import {
  GUEST_EMAIL_COOKIE,
  setGuestEmailSession,
} from "@/lib/auth/guest-email-session";

export async function saveGuestEmail(
  context: GuestContactContext,
  locale: "en" | "es",
  formData: FormData,
): Promise<void> {
  const language = locale === "es" ? "es" : "en";
  const resolved = await resolveGuestContactAuthority(context);
  let result = "invalid";
  if (resolved) {
    try {
      if (formData.get("operation") === "disable") {
        await disableGuestContact(
          getDatabaseConnection().db,
          resolved.authority,
          new SystemClock(),
        );
        if (context.kind === "session") {
          (await cookies()).delete(GUEST_EMAIL_COOKIE);
          redirect(`/${language}/guest/email-status`);
        }
        result = "disabled";
      } else if (formData.get("consent") === "on") {
        const google = formData.get("addressSource") === "google";
        const email = google
          ? resolved.verifiedEmail
          : String(formData.get("email") ?? "").trim();
        if (email) {
          const state = await registerGuestContact(
            getDatabaseConnection().db,
            {
              ...resolved.authority,
              email,
              locale: language,
              consent: true,
              verifiedGoogle: google && Boolean(resolved.verifiedEmail),
            },
            new SystemClock(),
          );
          result = state.status;
          if (context.kind === "session" && state.status !== "demo") {
            // Updating a contact revokes this session's old capability generation.
            (await cookies()).delete(GUEST_EMAIL_COOKIE);
            redirect(
              state.status === "enabled"
                ? `/${language}/visits?email=enabled&emailInvitation=${resolved.authority.invitationId}#guest-email-${resolved.authority.invitationId}`
                : `/${language}/guest/email-status?state=unverified`,
            );
          }
        }
      }
    } catch (error) {
      if (!(error instanceof GuestContactError)) throw error;
      result = error.code;
    }
  }
  const base =
    context.kind === "token"
      ? `/${language}/g/${encodeURIComponent(context.token)}`
      : context.kind === "account"
        ? `/${language}/visits`
        : `/${language}/guest`;
  const anchor = resolved
    ? `guest-email-${resolved.authority.invitationId}`
    : "guest-email";
  redirect(
    `${base}?email=${result}&emailInvitation=${resolved?.authority.invitationId ?? ""}#${anchor}`,
  );
}

export async function confirmGuestEmail(
  locale: "en" | "es",
  formData: FormData,
): Promise<void> {
  const language = locale === "es" ? "es" : "en";
  const capability = String(formData.get("capability") ?? "");
  const verified = await verifyGuestContact(
    getDatabaseConnection().db,
    capability,
    new SystemClock(),
  );
  if (!verified || !(await setGuestEmailSession(verified.capability))) {
    redirect(`/${language}/guest/verify?invalid=1`);
  }
  redirect(`/${verified.locale}/guest?email=enabled`);
}
