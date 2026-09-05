import styles from "@/components/guest/guest-ledger.module.css";
import { getTranslations } from "next-intl/server";
import { formatDateStay } from "@/components/frontend-utils";
import { sqlClient, type DatabaseClient } from "@/core/db/client";

/** homeId must come from requireHost, never from query/form input. */
export async function HostVisitNotes({
  database,
  homeId,
  locale,
}: {
  database: DatabaseClient;
  homeId: string;
  locale: "en" | "es";
}) {
  const t = await getTranslations({
    locale,
    namespace: "Host.visitInformation",
  });
  const notes = await sqlClient(database)<
    {
      id: string;
      family_name: string;
      start: string;
      end: string;
      guest_notes: string;
    }[]
  >`
    select v.id, p.family_name, lower(v.stay)::text as start, upper(v.stay)::text as end, v.guest_notes
    from public.visits v join public.parties p on p.id = v.party_id and p.home_id = v.home_id
    where v.home_id = ${homeId} and v.guest_notes <> ''
    order by lower(v.stay) desc, v.id limit 50
  `;
  if (!notes.length) return null;
  return (
    <details>
      <summary className={styles.cancellationToggle}>{t("title")}</summary>
      <ul>
        {notes.map((visit) => (
          <li key={visit.id}>
            <strong>{visit.family_name}</strong> ·{" "}
            {formatDateStay([visit.start, visit.end], locale)}
            <p style={{ whiteSpace: "pre-wrap" }}>{visit.guest_notes}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
