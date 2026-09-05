import { getTranslations } from "next-intl/server";
import { getDatabaseConnection } from "@/core/db/client";
import { CancellationReview } from "./cancellation-review";

export async function AccountPendingInvitations({
  userId,
  locale,
  action,
  changedInvitation,
}: {
  userId: string;
  locale: "en" | "es";
  action: (formData: FormData) => Promise<void>;
  changedInvitation?: string;
}) {
  const t = await getTranslations({ locale, namespace: "Cancellation" });
  const invitations = await getDatabaseConnection().sql<
    { id: string; family_name: string }[]
  >`
    select i.id, p.family_name from public.invitations i
    join public.parties p on p.id = i.party_id and p.home_id = i.home_id
    where p.auth_user_id = ${userId} and i.status <> 'cancelled'
      and not exists (select 1 from public.visits v where v.invitation_id = i.id and v.status <> 'cancelled')
    order by i.created_at desc limit 100
  `;
  if (!invitations.length) return null;
  return (
    <section>
      <h2>{t("pendingInvitations")}</h2>
      <ul>
        {invitations.map((invitation) => (
          <li key={invitation.id}>
            <strong>{invitation.family_name}</strong>
            <CancellationReview
              locale={locale}
              action={action}
              invitationId={invitation.id}
              visit={null}
              open={changedInvitation === invitation.id}
              changed={changedInvitation === invitation.id}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
