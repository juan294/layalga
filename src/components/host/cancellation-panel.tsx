import styles from "@/components/guest/guest-ledger.module.css";
import { getTranslations } from "next-intl/server";
import { CancellationReview } from "@/components/guest/cancellation-review";
import { sqlClient, type DatabaseClient } from "@/core/db/client";

export async function HostCancellationPanel({
  database,
  homeId,
  locale,
  action,
  changedInvitation,
}: {
  database: DatabaseClient;
  homeId: string;
  locale: "en" | "es";
  action: (formData: FormData) => Promise<void>;
  changedInvitation?: string;
}) {
  const t = await getTranslations({ locale, namespace: "Cancellation" });
  const invitations = await sqlClient(database)<
    {
      id: string;
      family_name: string;
      visit_id: string | null;
      start: string | null;
      end: string | null;
    }[]
  >`
    select i.id, p.family_name, v.id as visit_id, lower(v.stay)::text as start, upper(v.stay)::text as end
    from public.invitations i join public.parties p on p.id = i.party_id and p.home_id = i.home_id
    left join lateral (select id, stay from public.visits where invitation_id = i.id and status <> 'cancelled' order by created_at desc limit 1) v on true
    where i.home_id = ${homeId} and i.status <> 'cancelled'
    order by i.created_at desc limit 100
  `;
  if (!invitations.length) return null;
  return (
    <details open={Boolean(changedInvitation)}>
      <summary className={styles.cancellationToggle}>{t("hostTitle")}</summary>
      <ul>
        {invitations.map((invitation) => (
          <li key={invitation.id}>
            <strong>{invitation.family_name}</strong>
            <CancellationReview
              locale={locale}
              action={action}
              invitationId={invitation.id}
              changed={changedInvitation === invitation.id}
              open={changedInvitation === invitation.id}
              visit={
                invitation.visit_id && invitation.start && invitation.end
                  ? {
                      id: invitation.visit_id,
                      stay: [invitation.start, invitation.end],
                    }
                  : null
              }
            />
          </li>
        ))}
      </ul>
    </details>
  );
}
