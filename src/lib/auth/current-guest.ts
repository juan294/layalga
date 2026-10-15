import "server-only";

import { cookies } from "next/headers";

import { getDatabaseConnection } from "@/core/db/client";
import { SystemClock } from "@/core/clock";
import { resolveGuestReturnCapability } from "@/core/notifications/guest-contact";
import { GUEST_EMAIL_COOKIE } from "./guest-email-session";

export interface GuestInvitationRecord {
  invitationId: string;
  homeId: string;
  partyId: string;
  partyLocale: "en" | "es";
}

export async function getCurrentGuestInvitation(): Promise<GuestInvitationRecord | null> {
  const cookieStore = await cookies();
  const capability = cookieStore.get(GUEST_EMAIL_COOKIE)?.value;
  if (!capability) return null;
  const authority = await resolveGuestReturnCapability(
    getDatabaseConnection().db,
    capability,
    new SystemClock(),
  );
  return authority
    ? {
        invitationId: authority.invitationId,
        homeId: authority.homeId,
        partyId: authority.partyId,
        partyLocale: authority.locale,
      }
    : null;
}
