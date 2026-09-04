import "server-only";

import { cookies } from "next/headers";

import { getDatabaseConnection } from "@/core/db/client";

import { DEMO_GUEST_COOKIE, readDemoGuestCookie } from "./demo-session";

export interface GuestInvitationRecord {
  invitationId: string;
  homeId: string;
  partyId: string;
  partyLocale: "en" | "es";
}

export async function getCurrentGuestInvitation(): Promise<GuestInvitationRecord | null> {
  if (process.env.DEMO_MODE !== "true") return null;

  const cookieStore = await cookies();
  const invitationId = readDemoGuestCookie(
    cookieStore.get(DEMO_GUEST_COOKIE)?.value,
  );
  return invitationId ? findDemoGuestInvitationById(invitationId) : null;
}

async function findDemoGuestInvitationById(
  invitationId: string,
): Promise<GuestInvitationRecord | null> {
  const sql = getDatabaseConnection().sql;
  const [row] = await sql<
    { home_id: string; party_id: string; locale: "en" | "es" }[]
  >`
    select invitation.home_id, invitation.party_id, party.locale
    from public.invitations as invitation
    join public.parties as party on party.id = invitation.party_id
    join public.homes as home on home.id = invitation.home_id
    where invitation.id = ${invitationId}
      and invitation.status <> 'cancelled'
      and home.demo = true
  `;
  return row
    ? {
        invitationId,
        homeId: row.home_id,
        partyId: row.party_id,
        partyLocale: row.locale,
      }
    : null;
}
