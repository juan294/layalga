import type { AppLocale } from "@/i18n/routing";
import { getDatabaseConnection } from "../db/client";
import { SystemClock } from "../clock";
import type { InvitationByToken } from "./invitations";
import { loadInvitationVisitRecord } from "./guest-invitation";

/** A private request authorizes only the visit booked for that account. */
export async function loadRequestedVisit(
  userId: string,
  requestId: string,
  locale: AppLocale,
) {
  const [owned] = await getDatabaseConnection().sql<
    (Pick<
      InvitationByToken,
      "id" | "homeId" | "partyId" | "partyName" | "partyLocale" | "structured"
    > & { visitId: string })[]
  >`
    select i.id, i.home_id as "homeId", i.party_id as "partyId", p.family_name as "partyName", p.locale as "partyLocale", i.structured, v.id as "visitId" from public.stay_requests r
    join public.visits v on (v.home_id, v.id) = (r.home_id, r.visit_id)
    join public.parties p on (p.home_id, p.id) = (v.home_id, v.party_id)
    join public.invitations i on (i.home_id, i.id, i.party_id) = (v.home_id, v.invitation_id, v.party_id)
    where r.id = ${requestId} and r.requester_id = ${userId}
      and p.auth_user_id = r.requester_id and r.status = 'confirmed'
  `;
  if (!owned) return null;
  return loadInvitationVisitRecord(
    owned,
    locale,
    new SystemClock(),
    owned.visitId,
  );
}
