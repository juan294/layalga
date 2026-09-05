import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { DbDemoClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import { formatDateStay } from "@/components/frontend-utils";
import {
  headingStyle,
  panelStyle,
  graphite,
  rule,
  labelStyle,
} from "./host-styles";

/** Current household outcomes; tool execution counts are kept in the activity log. */
export async function HostOutcomes({
  homeId,
  locale,
  children,
}: {
  homeId: string;
  locale: "en" | "es";
  children?: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "HostOutcomes" });
  const connection = getDatabaseConnection();
  const clock = await DbDemoClock.load(homeId, connection.db);
  const now = clock.now().toISOString();
  const visits = await connection.sql<
    {
      id: string;
      family_name: string;
      start: string;
      end: string;
      outcome:
        | "hold"
        | "expired"
        | "confirmed"
        | "reconfirm_pending"
        | "reconfirmed"
        | "escalated"
        | "arrived";
    }[]
  >`
    select v.id, p.family_name, lower(v.stay)::text as start, upper(v.stay)::text as end,
      case when v.status='hold' and (v.hold_expires_at is null or v.hold_expires_at<=${now}) then 'expired'
        when v.status in ('confirmed','reconfirmed') and lower(v.stay)<=(${now}::timestamptz at time zone h.timezone)::date then 'arrived'
        else v.status end as outcome
    from public.visits v
    join public.parties p on p.id=v.party_id and p.home_id=v.home_id
    join public.homes h on h.id=v.home_id
    where v.home_id=${homeId} and v.status<>'cancelled'
      and upper(v.stay)>(${now}::timestamptz at time zone h.timezone)::date
    order by case when v.status='escalated' then 0 when v.status='reconfirm_pending' then 1 else 2 end,
      lower(v.stay),v.id limit 8
  `;
  return (
    <section id="current-visits" data-testid="host-outcomes" style={panelStyle}>
      <p style={labelStyle}>{t("eyebrow")}</p>
      <h2 style={headingStyle}>{t("title")}</h2>
      {visits.length ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visits.map((visit) => (
            <li
              key={visit.id}
              data-visit-outcome={visit.outcome}
              style={{ borderTop: `1px solid ${rule}`, padding: "0.9rem 0" }}
            >
              <strong>{visit.family_name}</strong> ·{" "}
              {formatDateStay([visit.start, visit.end], locale)}
              <p style={{ margin: "0.4rem 0" }}>
                {t(`status.${visit.outcome}`)}
              </p>
              <p style={{ color: graphite, margin: 0 }}>
                {t(`next.${visit.outcome}`)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: graphite }}>{t("empty")}</p>
      )}
      <p style={{ color: graphite }}>{t("calendar")}</p>
      {children}
    </section>
  );
}
