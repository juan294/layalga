import { HostOutcomes } from "@/components/host/host-outcomes";
import { GuestDeliveryPanel } from "@/components/host/guest-delivery-panel";
import { HostCancellationPanel } from "@/components/host/cancellation-panel";
import { getMessages, getTranslations } from "next-intl/server";
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
import { captureHistory } from "./capture-history";
import {
  CaptureQueuedPanel,
  CaptureInvitationForm,
} from "@/components/host/capture-invitation-form";
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
  headingStyle,
  labelStyle,
  panelStyle,
  sectionGridStyle,
} from "@/components/host/host-styles";

interface HostPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    cancel?: string;
    invitation?: string;
    capturePage?: string;
    captureRun?: string;
  }>;
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
  const { host, locale: safeLocale, timeZone } = await loadHostContext(locale);
  after(() =>
    dispatchHostEmailPingsSafely(getDatabaseConnection().db, new SystemClock()),
  );
  const t = await getTranslations({ locale: safeLocale, namespace: "Host" });
  const sql = sqlClient(getDatabaseConnection().db);
  const messages = await getMessages({ locale: safeLocale });
  const captureLabels = {
    ...messages.Host.capture,
    remembered: t("memory.remembered"),
  };
  const currentMonth = householdMonth(timeZone);
  const monthWindow = calendarMonthWindow(currentMonth);

  const query = await searchParams;
  const [decisionRows, hubStatuses, parties, history] = await Promise.all([
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
    loadHubStatuses(getDatabaseConnection().db, host.homeId, host.id, [
      monthWindow.from,
      monthWindow.to,
    ]),
    sql<
      {
        id: string;
        family_name: string;
        last_invite: string | null;
        last_stay: string | null;
      }[]
    >`
      select p.id, p.family_name,
        (select max(i.created_at)::text from public.invitations i where i.party_id = p.id and i.home_id = p.home_id) as last_invite,
        (select max(lower(v.stay))::text from public.visits v where v.party_id = p.id
          and v.home_id = p.home_id and v.status = 'confirmed' and lower(v.stay) <= current_date) as last_stay
      from public.parties p where p.home_id = ${host.homeId}
      order by p.family_name, last_invite desc nulls last, p.id
    `,
    captureHistory(host, query.capturePage),
  ]);
  const selected = history.rows.find((row) => row.id === query.captureRun);
  const statusLabel = await getTranslations({
    locale: safeLocale,
    namespace: "Runs.status",
  });

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

  const now = new Date().toISOString();
  const season = householdSeason(now, timeZone);
  const dateSeasonLabel = `${formatHouseholdDate(
    now,
    safeLocale,
    timeZone,
  )} · ${SEASON_LABEL[season]}`;

  return (
    <>
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
            parties={parties.map((party) => ({
              id: party.id,
              label: [
                party.family_name,
                party.last_invite &&
                  t("capture.lastInvite", {
                    date: formatHouseholdDate(
                      party.last_invite,
                      safeLocale,
                      timeZone,
                    ),
                  }),
                party.last_stay &&
                  t("capture.lastStay", {
                    date: formatHouseholdDate(
                      party.last_stay + "T12:00:00Z",
                      safeLocale,
                      "UTC",
                    ),
                  }),
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
            labels={captureLabels}
            locale={safeLocale}
            timeZone={timeZone}
          />
          {(history.rows.length > 0 || history.page > 0) && (
            <section
              id="capture-history"
              style={{ overflowWrap: "anywhere" }}
              aria-label={captureLabels.history}
            >
              <h3>{captureLabels.history}</h3>
              <ul>
                {history.rows.map((row) => (
                  <li key={row.id}>
                    <a
                      href={`?capturePage=${history.page}&captureRun=${row.id}#capture-history`}
                    >
                      {formatHouseholdDateTime(
                        new Date(row.started_at).toISOString(),
                        safeLocale,
                        timeZone,
                      )}{" "}
                      · {statusLabel(row.status)} · {row.id}
                    </a>
                  </li>
                ))}
              </ul>
              {history.page > 0 && (
                <a href={`?capturePage=${history.page - 1}#capture-history`}>
                  {captureLabels.newer}
                </a>
              )}{" "}
              {history.more && (
                <a href={`?capturePage=${history.page + 1}#capture-history`}>
                  {captureLabels.older}
                </a>
              )}
              {selected && (
                <CaptureQueuedPanel
                  key={selected.id}
                  runId={selected.id}
                  labels={captureLabels}
                  locale={safeLocale}
                  timeZone={timeZone}
                  retryable={selected.retryable}
                  initial={{
                    id: selected.id,
                    status: selected.status,
                    finishedAt: null,
                    summary: null,
                    events: [],
                  }}
                />
              )}
            </section>
          )}
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
