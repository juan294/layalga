import { HostOutcomes } from "@/components/host/host-outcomes";
import { GuidedDemoPanel } from "@/components/host/guided-demo-panel";
import { GuestDeliveryPanel } from "@/components/host/guest-delivery-panel";
import { HostCancellationPanel } from "@/components/host/cancellation-panel";
import { getTranslations } from "next-intl/server";
import { after } from "next/server";

import { verifiedHostDecisionContext } from "@/agent/host-decision-context";
import { SystemClock } from "@/core/clock";
import { sqlClient } from "@/core/db/client";
import { getDatabaseConnection } from "@/core/db/client";
import { dispatchHostEmailPingsSafely } from "@/core/notifications/email-outbox";
import { decisionReasonKey } from "@/lib/decision-reasons";
import { objectValue } from "@/lib/json-object";
import {
  calendarMonthWindow,
  formatDateStay,
  formatHouseholdDate,
  formatHouseholdDateTime,
  householdMonth,
} from "@/components/frontend-utils";
import { householdSeason, SEASON_LABEL } from "@/lib/season";
import { CaptureInvitationForm } from "@/components/host/capture-invitation-form";
import { DemoClockPanel } from "@/components/host/demo-clock-panel";
import { DemoSeasonSync } from "@/components/host/demo-season-sync";
import { DemoZone } from "@/components/host/demo-zone";
import { HubCards, type HubCard } from "@/components/host/hub-cards";
import { TodayHero } from "@/components/host/today-hero";
import { cancelHostInvitation } from "./actions";
import { loadHostContext } from "./host-context";
import { loadHubStatuses } from "./hub-status";
import {
  PendingDecisions,
  type PendingDecisionItem,
} from "@/components/host/pending-decisions";
import {
  graphite,
  headingStyle,
  labelStyle,
  panelStyle,
  sectionGridStyle,
} from "@/components/host/host-styles";

interface HostPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cancel?: string; invitation?: string }>;
}

interface DecisionRow {
  id: string;
  status: "pending" | "approved" | "declined";
  family_name: string | null;
  reason: unknown;
  note: string | null;
  application_error: string | null;
  overlap_count: number;
  created_at: Date | string;
}

export default async function HostTodayPage({
  params,
  searchParams,
}: HostPageProps) {
  const { locale } = await params;
  const { host, locale: safeLocale, timeZone, demoNow } = await loadHostContext(locale);
  after(() =>
    dispatchHostEmailPingsSafely(getDatabaseConnection().db, new SystemClock()),
  );
  const t = await getTranslations({ locale: safeLocale, namespace: "Host" });
  const sql = sqlClient(getDatabaseConnection().db);
  const currentMonth = householdMonth(demoNow ?? undefined, undefined, timeZone);
  const monthWindow = calendarMonthWindow(currentMonth);

  const [decisionRows, hubStatuses] = await Promise.all([
    sql<DecisionRow[]>`
      select pd.id, pd.status, p.family_name,
        pd.reason, pd.note, pd.application_error, pd.created_at,
        case
          when pd.reason->>'stayApprovalHash' ~ '^[0-9a-f]{64}$'
            and pd.reason#>>'{requestedDraft,stay,0}' is not null
            and pd.reason#>>'{requestedDraft,stay,1}' is not null
          then (
            select count(*)::integer
            from public.visits other
            where other.home_id = pd.home_id
              and other.status <> 'cancelled'
              and case
                when rn.payload->>'visitId' ~* '^[0-9a-f-]{36}$'
                then other.id <> (rn.payload->>'visitId')::uuid
                else true
              end
              and other.stay && daterange(
                (pd.reason#>>'{requestedDraft,stay,0}')::date,
                (pd.reason#>>'{requestedDraft,stay,1}')::date,
                '[)'
              )
          )
          else 0
        end as overlap_count
      from public.pending_decisions pd
      join public.runs rn on rn.id = pd.run_id
      left join public.visits v on v.id = pd.visit_id
      left join public.invitations i on i.id = coalesce(
        v.invitation_id,
        case when rn.payload->>'invitationId' ~* '^[0-9a-f-]{36}$'
          then (rn.payload->>'invitationId')::uuid else null end
      )
      left join public.parties p on p.id = coalesce(v.party_id, i.party_id)
      where pd.home_id = ${host.homeId}
        and (
          pd.status = 'pending'
          or (
            pd.status in ('approved', 'declined')
            and pd.applied_run_id is null
          )
        )
      order by pd.created_at
    `,
    loadHubStatuses(
      getDatabaseConnection().db,
      host.homeId,
      host.id,
      [monthWindow.from, monthWindow.to],
    ),
  ]);

  const decisions: PendingDecisionItem[] = decisionRows.map((decision) => {
    const context = verifiedHostDecisionContext(decision.reason);
    return {
      id: decision.id,
      status: decision.status,
      partyName: decision.family_name ?? t("unknownParty"),
      partySummary: context
        ? t("decisions.partySummary", {
            adults: context.adults,
            children: context.children,
            pets: context.pets,
          })
        : t("decisions.contextUnavailable"),
      reason: reasonLabel(decision.reason, t),
      requestDetail: context
        ? context.overflowRooms && context.overflowArrangements
          ? t("decisions.overflowDetail", {
              rooms: context.overflowRooms
                .map(({ guestLabel }) => guestLabel)
                .join(", "),
              arrangements: context.overflowArrangements.join("; "),
            })
          : context.specialRequests.join("; ") || null
        : null,
      overlapSummary:
        context && decision.overlap_count > 0
          ? t("decisions.overlapSummary", { count: decision.overlap_count })
          : null,
      note: decision.note,
      applicationFailed: decision.application_error !== null,
      requestedStay: context
        ? formatDateStay(context.stay, safeLocale)
        : t("decisions.stayUnavailable"),
      createdAt: formatHouseholdDateTime(
        String(decision.created_at),
        safeLocale,
        timeZone,
      ),
    };
  });

  const monthLabel = new Intl.DateTimeFormat(safeLocale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(currentMonth);
  const hubCards: HubCard[] = [
    {
      href: `/${safeLocale}/calendar`,
      eyebrow: t("calendar.eyebrow"),
      title: t("calendar.title"),
      status: t("hub.calendarStatus", {
        month: monthLabel,
        count: hubStatuses.visitsThisMonth,
      }),
    },
    {
      href: `/${safeLocale}/rooms`,
      eyebrow: t("rooms.eyebrow"),
      title: t("rooms.title"),
      status: t("hub.roomsStatus", {
        available: hubStatuses.roomsAvailable,
        withheld: hubStatuses.roomsWithheld,
      }),
    },
    {
      href: `/${safeLocale}/guests`,
      eyebrow: t("memory.eyebrow"),
      title: t("memory.title"),
      status: t("hub.guestsStatus", { count: hubStatuses.familiesOnFile }),
    },
    {
      href: `/${safeLocale}/settings`,
      eyebrow: t("settings.eyebrow"),
      title: t("settings.title"),
      status: t("hub.settingsStatus", {
        pings: hubStatuses.emailPingsEnabled ? "on" : "off",
        max: hubStatuses.maxFamiliesWithChildren,
      }),
    },
    {
      href: `/${safeLocale}/activity`,
      eyebrow: t("activity.eyebrow"),
      title: t("activity.title"),
      status: t("hub.activityStatus", {
        recorded: hubStatuses.activityRecorded ? "yes" : "no",
      }),
    },
  ];

  const season = householdSeason(demoNow ?? new Date().toISOString(), timeZone);
  const dateSeasonLabel = `${formatHouseholdDate(
    demoNow ?? new Date().toISOString(),
    safeLocale,
    timeZone,
  )} · ${SEASON_LABEL[season]}`;

  return (
    <>
      {demoNow ? <DemoSeasonSync demoNow={demoNow} timeZone={timeZone} /> : null}
      <TodayHero
        dateSeasonLabel={dateSeasonLabel}
        eyebrow={t("eyebrow")}
        season={season}
        title={t("title")}
        welcomeLabel={t("welcome", { name: host.displayName })}
      />

      <div style={sectionGridStyle}>
        <section id="host-decisions" style={panelStyle}>
          <p style={labelStyle}>{t("decisions.eyebrow")}</p>
          <h2 style={headingStyle}>{t("decisions.title")}</h2>
          <PendingDecisions
            decisions={decisions}
            labels={{
              empty: t("decisions.empty"),
              reason: t("decisions.reason"),
              requestedStay: t("decisions.requestedStay"),
              createdAt: t("decisions.createdAt"),
              requestDetail: t("decisions.requestDetail"),
              overlap: t("decisions.overlap"),
              note: t("decisions.note"),
              notePlaceholder: t("decisions.notePlaceholder"),
              approve: t("decisions.approve"),
              approving: t("decisions.approving"),
              decline: t("decisions.decline"),
              declining: t("decisions.declining"),
              retryApproved: t("decisions.retryApproved"),
              retryApproving: t("decisions.retryApproving"),
              retryDeclined: t("decisions.retryDeclined"),
              retryDeclining: t("decisions.retryDeclining"),
              retryHelp: t("decisions.retryHelp"),
              applying: t("decisions.applying"),
            }}
            locale={safeLocale}
          />
        </section>

        <section id="capture-invitation" style={panelStyle}>
          <p style={labelStyle}>{t("capture.eyebrow")}</p>
          <h2 style={headingStyle}>{t("capture.title")}</h2>
          <CaptureInvitationForm
            labels={{
              message: t("capture.message"),
              placeholder: t("capture.placeholder"),
              submit: t("capture.submit"),
              pending: t("capture.pending"),
              result: t("capture.result"),
              structured: t("capture.structured"),
              remembered: t("memory.remembered"),
              guestLink: t("capture.guestLink"),
              copy: t("capture.copy"),
              copied: t("capture.copied"),
              copyFailed: t("capture.copyFailed"),
              emptyError: t("capture.emptyError"),
              failedError: t("capture.failedError"),
              queued: t("capture.queued"),
              statusLink: t("capture.statusLink"),
              reveal: t("capture.reveal"),
              revealing: t("capture.revealing"),
              completionFailed: t("capture.completionFailed"),
            }}
            locale={safeLocale}
            timeZone={timeZone}
          />
        </section>
      </div>

      <div style={sectionGridStyle}>
        <HostOutcomes homeId={host.homeId} locale={safeLocale}>
          <HostCancellationPanel
            database={getDatabaseConnection().db}
            homeId={host.homeId}
            locale={safeLocale}
            action={cancelHostInvitation}
            changedInvitation={
              (await searchParams).cancel === "changed"
                ? (await searchParams).invitation
                : undefined
            }
          />
        </HostOutcomes>
        <GuestDeliveryPanel homeId={host.homeId} locale={safeLocale} />
      </div>

      <HubCards cards={hubCards} openLabel={t("hub.open")} />

      {process.env.DEMO_MODE === "true" && host.demo ? (
        <DemoZone tag={t("demoZone.tag")}>
          <div style={sectionGridStyle}>
            <GuidedDemoPanel homeId={host.homeId} locale={safeLocale} />
            {demoNow ? (
              <section style={panelStyle}>
                <p style={labelStyle}>{t("demo.eyebrow")}</p>
                <h2 style={headingStyle}>{t("demo.title")}</h2>
                <p style={{ color: graphite, lineHeight: 1.6, margin: 0 }}>
                  {t("demo.description")}
                </p>
                <DemoClockPanel
                  current={demoNow}
                  currentLabel={formatHouseholdDateTime(
                    demoNow,
                    safeLocale,
                    timeZone,
                  )}
                  homeId={host.homeId}
                  labels={{
                    current: t("demo.current"),
                    chase: t("demo.chase"),
                    escalation: t("demo.escalation"),
                    custom: t("demo.custom"),
                    set: t("demo.set"),
                    working: t("demo.working"),
                    error: t("demo.error"),
                    noEligible: t("demo.noEligible"),
                    alreadyDue: t("demo.alreadyDue"),
                    advanced: t("demo.advanced"),
                    backward: t("demo.backward"),
                  }}
                  locale={safeLocale}
                  timeZone={timeZone}
                />
              </section>
            ) : null}
          </div>
        </DemoZone>
      ) : null}
    </>
  );
}

function reasonLabel(
  value: unknown,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  const reason = objectValue(value);
  const key = decisionReasonKey(reason?.reason ?? reason?.decision);
  return t(`decisionReasons.${key}`);
}
