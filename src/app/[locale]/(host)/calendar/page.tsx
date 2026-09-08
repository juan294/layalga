import { getTranslations } from "next-intl/server";

import { getDatabaseConnection, sqlClient } from "@/core/db/client";
import {
  calendarMonthFromSearch,
  calendarMonthValue,
  calendarMonthWindow,
  householdMonth,
} from "@/components/frontend-utils";
import { HostBreadcrumb } from "@/components/host/host-breadcrumb";
import { HostVisitNotes } from "@/components/host/host-visit-notes";
import {
  CalendarLedger,
  type LedgerVisit,
} from "@/components/host/calendar-ledger";
import { labelStyle, pageHeadingStyle, panelStyle } from "@/components/host/host-styles";
import { loadHostContext } from "../host-context";

interface VisitRow {
  id: string;
  family_name: string;
  stay_start: string;
  stay_end: string;
  status: string;
  room_names: string[];
}

export default async function HostCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  const { host, locale: safeLocale, timeZone, demoNow } = await loadHostContext(locale);
  const t = await getTranslations({ locale: safeLocale, namespace: "Host" });
  const defaultMonth = householdMonth(demoNow ?? undefined, undefined, timeZone);
  const calendarMonth = calendarMonthFromSearch(
    (await searchParams).month,
    defaultMonth,
  );
  const calendarWindow = calendarMonthWindow(calendarMonth);

  const sql = sqlClient(getDatabaseConnection().db);
  const visitRows = await sql<VisitRow[]>`
    select v.id, p.family_name, lower(v.stay)::text as stay_start,
      upper(v.stay)::text as stay_end, v.status,
      coalesce(array_agg(r.name order by r.name)
        filter (where r.id is not null), '{}') as room_names
    from public.visits v
    join public.parties p on p.id = v.party_id
    left join public.visit_rooms vr on vr.visit_id = v.id
    left join public.rooms r on r.id = vr.room_id
    where v.home_id = ${host.homeId}
      and v.status <> 'cancelled'
      and v.stay && daterange(
        ${calendarWindow.from}::date,
        ${calendarWindow.to}::date,
        '[)'
      )
    group by v.id, p.family_name
    order by lower(v.stay), p.family_name
  `;
  const visits: LedgerVisit[] = visitRows.map((visit) => ({
    id: visit.id,
    familyName: visit.family_name,
    start: visit.stay_start,
    end: visit.stay_end,
    status: visit.status,
    rooms: visit.room_names,
  }));
  const statusLabels = {
    hold: t("status.hold"),
    confirmed: t("status.confirmed"),
    reconfirm_pending: t("status.reconfirmPending"),
    reconfirmed: t("status.reconfirmed"),
    escalated: t("status.escalated"),
  };

  return (
    <>
      <HostBreadcrumb label={t("nav.backToToday")} locale={safeLocale} />
      <p style={labelStyle}>{t("calendar.eyebrow")}</p>
      <h1 style={pageHeadingStyle}>{t("calendar.title")}</h1>
      <div style={{ ...panelStyle, marginTop: "1.25rem" }}>
        <HostVisitNotes
          database={getDatabaseConnection().db}
          homeId={host.homeId}
          locale={safeLocale}
        />
        <CalendarLedger
          emptyLabel={t("calendar.empty")}
          locale={safeLocale}
          month={calendarMonth}
          navigation={{
            previousHref: `/${safeLocale}/calendar?month=${calendarMonthValue(calendarMonth, -1)}`,
            previousLabel: t("calendar.previous"),
            nextHref: `/${safeLocale}/calendar?month=${calendarMonthValue(calendarMonth, 1)}`,
            nextLabel: t("calendar.next"),
            visitCountLabel: t("calendar.visitCount", { count: visits.length }),
          }}
          roomsLabel={t("calendar.rooms")}
          statusLabels={statusLabels}
          visits={visits}
        />
      </div>
    </>
  );
}
