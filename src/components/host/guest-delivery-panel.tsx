import { getTranslations } from "next-intl/server";
import {
  formatDateStay,
  formatHouseholdDateTime,
} from "@/components/frontend-utils";
import { getDatabaseConnection } from "@/core/db/client";
import { DbDemoClock } from "@/core/clock";
import { loadGuestDeliveryFacts } from "@/core/notifications/guest-outbox";
import { headingStyle, panelStyle, graphite, rule } from "./host-styles";

export async function GuestDeliveryPanel({
  homeId,
  locale,
}: {
  homeId: string;
  locale: "en" | "es";
}) {
  const t = await getTranslations({ locale, namespace: "GuestDeliveryHost" });
  const connection = getDatabaseConnection();
  const clock = await DbDemoClock.load(homeId, connection.db);
  const visits = await connection.sql<
    {
      id: string;
      family_name: string;
      start: string;
      end: string;
      timezone: string;
      demo: boolean;
    }[]
  >`
    select v.id, p.family_name, lower(v.stay)::text as start, upper(v.stay)::text as end,
      h.timezone, h.demo from public.visits v
    join public.parties p on p.id = v.party_id and p.home_id = v.home_id
    join public.homes h on h.id = v.home_id
    where v.home_id = ${homeId} and v.status in ('confirmed', 'reconfirm_pending', 'reconfirmed', 'escalated')
      and lower(v.stay) > (${clock.now().toISOString()}::timestamptz at time zone h.timezone)::date
    order by lower(v.stay) desc, v.id limit 50
  `;
  if (!visits.length) return null;
  const facts = new Map(
    (await loadGuestDeliveryFacts(connection.db, homeId, clock)).map((fact) => [
      fact.visitId,
      fact,
    ]),
  );
  return (
    <section style={panelStyle} data-testid="guest-delivery-panel">
      <h2 style={headingStyle}>{t("title")}</h2>
      <p style={{ color: graphite }}>{t("description")}</p>
      {!visits[0].demo && process.env.EMAIL !== "ses" ? (
        <p role="status">{t("unavailable")}</p>
      ) : null}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {visits.map((visit) => {
          const fact = facts.get(visit.id);
          return (
            <li
              key={visit.id}
              style={{ borderTop: `1px solid ${rule}`, padding: "0.8rem 0" }}
            >
              <strong>{visit.family_name}</strong> ·{" "}
              {formatDateStay([visit.start, visit.end], locale)}
              <p
                style={{ margin: "0.4rem 0" }}
                data-delivery-status={fact?.status ?? "no_contact"}
              >
                {t(`statuses.${fact?.status ?? "no_contact"}`)}
                {fact?.sentAt
                  ? ` · ${formatHouseholdDateTime(fact.sentAt, locale, visit.timezone)}`
                  : ""}
              </p>
            </li>
          );
        })}
      </ul>
      <p style={{ color: graphite }}>{t("acceptanceNote")}</p>
    </section>
  );
}
