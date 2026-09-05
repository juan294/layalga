import "server-only";

import { getDatabaseConnection } from "@/core/db/client";
import { AuthorizedGuestEmailPreferences } from "./guest-email-preferences";

/** userId comes from auth.getUser() on the account page. Actions recheck ownership. */
export async function AccountEmailPreferences({
  userId,
  verifiedEmail,
  locale,
  feedback,
  feedbackInvitation,
}: {
  userId: string;
  verifiedEmail: string | null;
  locale: "en" | "es";
  feedback?: string;
  feedbackInvitation?: string;
}) {
  const invitations = await getDatabaseConnection().sql<
    { id: string; home_id: string; party_id: string; family_name: string }[]
  >`
    select i.id, i.home_id, i.party_id, p.family_name from public.invitations i
    join public.parties p on p.id = i.party_id and p.home_id = i.home_id
    where p.auth_user_id = ${userId} and i.status <> 'cancelled'
      and i.link_token_revoked_at is null
      and i.link_token_expires_at > now()
    order by i.created_at desc limit 100
  `;
  return (
    <>
      {invitations.map((invitation) => (
        <section key={invitation.id}>
          <strong>{invitation.family_name}</strong>
          <AuthorizedGuestEmailPreferences
            locale={locale}
            context={{ kind: "account", invitationId: invitation.id }}
            resolved={{
              authority: {
                invitationId: invitation.id,
                homeId: invitation.home_id,
                partyId: invitation.party_id,
              },
              verifiedEmail,
            }}
            feedback={
              feedbackInvitation === invitation.id ? feedback : undefined
            }
          />
        </section>
      ))}
    </>
  );
}
