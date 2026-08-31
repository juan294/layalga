import { getTranslations } from "next-intl/server";

import { verifiedHostDecisionContext } from "@/agent/host-decision-context";
import { sqlClient } from "@/core/db/client";
import { getDatabaseConnection } from "@/core/db/client";
import { requireHost } from "@/lib/auth/current-host";
import {
  calendarMonthFromSearch,
  calendarMonthValue,
  calendarMonthWindow,
  formatDateStay,
  formatHouseholdDateTime,
  householdMonth,
} from "@/components/frontend-utils";
import {
  CalendarLedger,
  type LedgerVisit,
} from "@/components/host/calendar-ledger";
import { CaptureInvitationForm } from "@/components/host/capture-invitation-form";
import { DemoClockPanel } from "@/components/host/demo-clock-panel";
import { RoomLedger } from "@/components/host/room-ledger";
import { loadHostRoomLedger } from "./room-data";
import {
  PendingDecisions,
  type PendingDecisionItem,
} from "@/components/host/pending-decisions";
import {
  activityPolicyLabelKey,
  activityToolLabelKey,
} from "@/components/host/activity-labels";
import {
  graphite,
  headingStyle,
  ink,
  labelStyle,
  panelStyle,
  paper,
  quietButtonStyle,
  rule,
  sheet,
  teal,
} from "@/components/host/host-styles";

interface HostPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}

interface VisitRow {
  id: string;
  family_name: string;
  stay_start: string;
  stay_end: string;
  status: string;
  room_names: string[];
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

interface ActivityRow {
  id: string;
  source: "audit" | "notification";
  kind: string;
  detail: unknown;
  created_at: Date | string;
}

export default async function HostPage({
  params,
  searchParams,
}: HostPageProps) {
  const { locale } = await params;
  const safeLocale = locale === "es" ? "es" : "en";
  const host = await requireHost(safeLocale);
  const t = await getTranslations({ locale: safeLocale, namespace: "Host" });
  const sql = sqlClient(getDatabaseConnection().db);
  const clockRows = await sql<
    { now: Date | string | null; timezone: string }[]
  >`
    select dc.now, h.timezone
    from public.homes h
    left join public.demo_clock dc
      on dc.home_id = h.id and dc.enabled
    where h.id = ${host.homeId}
  `;
  const timeZone = clockRows[0]?.timezone ?? "UTC";
  const defaultMonth = householdMonth(
    clockRows[0]?.now ?? undefined,
    undefined,
    timeZone,
  );
  const calendarMonth = calendarMonthFromSearch(
    (await searchParams).month,
    defaultMonth,
  );
  const calendarWindow = calendarMonthWindow(calendarMonth);

  const [roomData, visitRows, decisionRows, activityRows] = await Promise.all([
    loadHostRoomLedger(sql, host.homeId, [
      calendarWindow.from,
      calendarWindow.to,
    ]),
    sql<VisitRow[]>`
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
    `,
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
    sql<ActivityRow[]>`
      (
        select ae.id, 'audit'::text as source, ae.kind, ae.payload as detail,
          ae.created_at
        from public.audit_events ae
        where ae.home_id = ${host.homeId}
      )
      union all
      (
        select n.id, 'notification'::text as source, n.kind,
          to_jsonb(${safeLocale === "es" ? sql`n.body_es` : sql`n.body_en`}) as detail,
          n.created_at
        from public.notifications n
        where n.home_id = ${host.homeId}
          and n.recipient_kind = 'host'
          and n.recipient_id = ${host.id}
      )
      order by created_at desc
      limit 20
    `,
  ]);

  const visits: LedgerVisit[] = visitRows.map((visit) => ({
    id: visit.id,
    familyName: visit.family_name,
    start: visit.stay_start,
    end: visit.stay_end,
    status: visit.status,
    rooms: visit.room_names,
  }));
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
      requestDetail: context?.specialRequests.join("; ") || null,
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
  const statusLabels = {
    hold: t("status.hold"),
    confirmed: t("status.confirmed"),
    reconfirm_pending: t("status.reconfirmPending"),
    reconfirmed: t("status.reconfirmed"),
    escalated: t("status.escalated"),
  };

  return (
    <main
      style={{
        background: paper,
        color: ink,
        display: "block",
        fontFamily: "var(--font-inter, Arial, sans-serif)",
        minHeight: "100vh",
        padding: "clamp(1rem, 4vw, 4rem)",
        textAlign: "left",
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: "92rem" }}>
        {process.env.DEMO_MODE === "true" && host.demo ? (
          <aside
            style={{
              alignItems: "center",
              background: teal,
              color: sheet,
              display: "flex",
              flexWrap: "wrap",
              fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
              fontSize: "0.75rem",
              fontWeight: 750,
              justifyContent: "space-between",
              letterSpacing: "0.1em",
              marginBottom: "1rem",
              padding: "0.65rem 0.9rem",
              textTransform: "uppercase",
            }}
          >
            <span>{t("demo.banner")}</span>
            <span>{t("demo.notLive")}</span>
          </aside>
        ) : null}

        <header
          style={{
            alignItems: "end",
            borderBottom: `3px double ${ink}`,
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            justifyContent: "space-between",
            padding: "0.5rem 0 1.4rem",
          }}
        >
          <div>
            <p style={{ ...labelStyle, color: teal }}>{t("eyebrow")}</p>
            <h1
              style={{
                fontFamily: "var(--font-fraunces, Georgia, serif)",
                fontSize: "clamp(2.5rem, 8vw, 6rem)",
                fontWeight: 560,
                letterSpacing: "-0.055em",
                lineHeight: 0.9,
                margin: "0.7rem 0 0",
              }}
            >
              {t("title")}
            </h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ color: graphite, margin: "0 0 0.55rem" }}>
              {t("welcome", { name: host.displayName })}
            </p>
            <form action="/auth/sign-out" method="post">
              <input name="locale" type="hidden" value={safeLocale} />
              <button style={quietButtonStyle} type="submit">
                {t("account.signOut")}
              </button>
            </form>
          </div>
        </header>

        <section style={{ marginTop: "clamp(1.5rem, 4vw, 3.5rem)" }}>
          <p style={labelStyle}>{t("rooms.eyebrow")}</p>
          <h2 style={headingStyle}>{t("rooms.title")}</h2>
          <div style={panelStyle}>
            <RoomLedger data={roomData} locale={safeLocale} />
          </div>
        </section>

        <section style={{ marginTop: "clamp(1.5rem, 4vw, 3.5rem)" }}>
          <p style={labelStyle}>{t("calendar.eyebrow")}</p>
          <h2 style={headingStyle}>{t("calendar.title")}</h2>
          <div style={panelStyle}>
            <CalendarLedger
              emptyLabel={t("calendar.empty")}
              locale={safeLocale}
              month={calendarMonth}
              navigation={{
                previousHref: `/${safeLocale}?month=${calendarMonthValue(calendarMonth, -1)}`,
                previousLabel: t("calendar.previous"),
                nextHref: `/${safeLocale}?month=${calendarMonthValue(calendarMonth, 1)}`,
                nextLabel: t("calendar.next"),
                visitCountLabel: t("calendar.visitCount", {
                  count: visits.length,
                }),
              }}
              roomsLabel={t("calendar.rooms")}
              statusLabels={statusLabels}
              visits={visits}
            />
          </div>
        </section>

        <div
          style={{
            alignItems: "start",
            display: "grid",
            gap: "clamp(1rem, 3vw, 2rem)",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
            marginTop: "clamp(1.5rem, 4vw, 3rem)",
          }}
        >
          <section style={panelStyle}>
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

          <section style={panelStyle}>
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

          {process.env.DEMO_MODE === "true" &&
          host.demo &&
          clockRows[0]?.now ? (
            <section style={panelStyle}>
              <p style={labelStyle}>{t("demo.eyebrow")}</p>
              <h2 style={headingStyle}>{t("demo.title")}</h2>
              <p style={{ color: graphite, lineHeight: 1.6, margin: 0 }}>
                {t("demo.description")}
              </p>
              <DemoClockPanel
                current={new Date(clockRows[0].now).toISOString()}
                currentLabel={formatHouseholdDateTime(
                  String(clockRows[0].now),
                  safeLocale,
                  clockRows[0].timezone,
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
                }}
                locale={safeLocale}
                timeZone={clockRows[0].timezone}
              />
            </section>
          ) : null}
        </div>

        <section
          style={{ ...panelStyle, marginTop: "clamp(1.5rem, 4vw, 3rem)" }}
        >
          <p style={labelStyle}>{t("activity.eyebrow")}</p>
          <h2 style={headingStyle}>{t("activity.title")}</h2>
          {activityRows.length ? (
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {activityRows.map((activity) => (
                <li
                  key={`${activity.source}-${activity.id}`}
                  style={{
                    alignItems: "baseline",
                    borderTop: `1px solid ${rule}`,
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "minmax(8rem, 0.25fr) 1fr",
                    padding: "0.75rem 0",
                  }}
                >
                  <time
                    dateTime={new Date(activity.created_at).toISOString()}
                    style={labelStyle}
                  >
                    {formatHouseholdDateTime(
                      String(activity.created_at),
                      safeLocale,
                      timeZone,
                    )}
                  </time>
                  <div>
                    <strong>{activityKind(activity.kind, t)}</strong>
                    <p
                      style={{
                        color: graphite,
                        lineHeight: 1.5,
                        margin: "0.2rem 0 0",
                      }}
                    >
                      {activityDetail(activity, safeLocale, t)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: graphite, margin: 0 }}>{t("activity.empty")}</p>
          )}
        </section>
      </div>
    </main>
  );
}

function reasonLabel(
  value: unknown,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  const reason = objectValue(value);
  const code = String(reason?.reason ?? reason?.decision ?? "other");
  if (code === "special_request") return t("decisionReasons.specialRequest");
  if (code === "children") return t("decisionReasons.children");
  if (code === "pets") return t("decisionReasons.pets");
  if (code === "beds") return t("decisionReasons.beds");
  return t("decisionReasons.other");
}

function activityKind(
  kind: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (kind === "tool_call") return t("activityKinds.toolCall");
  if (kind === "policy_verdict") return t("activityKinds.policyVerdict");
  if (kind === "decision_applied") return t("activityKinds.decisionApplied");
  if (kind === "reconfirm_chase") return t("activityKinds.reconfirmChase");
  if (kind === "reconfirm_escalation")
    return t("activityKinds.reconfirmEscalation");
  return t("activityKinds.other");
}

function activityDetail(
  activity: ActivityRow,
  locale: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (activity.source === "notification") {
    return typeof activity.detail === "string"
      ? activity.detail
      : t("activity.noDetail");
  }
  const detail = objectValue(activity.detail);
  if (typeof detail?.name === "string") {
    const key = activityToolLabelKey(detail.name);
    return t("activity.toolDetail", {
      name: key ? t(`activityTools.${key}`) : t("activityTools.other"),
    });
  }
  if (typeof detail?.decision === "string") {
    const key = activityPolicyLabelKey(detail.decision);
    return t("activity.policyDetail", {
      decision: key
        ? t(`activityPolicies.${key}`)
        : t("activityPolicies.other"),
    });
  }
  return `${t("activity.noDetail")} · ${new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
  }).format(new Date(activity.created_at))}`;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return objectValue(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
