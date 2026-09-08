import { getTranslations } from "next-intl/server";

import { getDatabaseConnection, sqlClient } from "@/core/db/client";
import { formatHouseholdDateTime } from "@/components/frontend-utils";
import {
  activityKindLabelKey,
  activityPolicyLabelKey,
  activityToolLabelKey,
} from "@/components/host/activity-labels";
import { HostBreadcrumb } from "@/components/host/host-breadcrumb";
import {
  graphite,
  labelStyle,
  pageHeadingStyle,
  panelStyle,
  rule,
} from "@/components/host/host-styles";
import { objectValue } from "@/lib/json-object";
import { loadHostContext } from "../host-context";

interface ActivityRow {
  id: string;
  source: "audit" | "notification";
  kind: string;
  detail: unknown;
  created_at: Date | string;
}

export default async function HostActivityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { host, locale: safeLocale, timeZone } = await loadHostContext(locale);
  const t = await getTranslations({ locale: safeLocale, namespace: "Host" });
  const sql = sqlClient(getDatabaseConnection().db);
  const activityRows = await sql<ActivityRow[]>`
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
  `;

  return (
    <>
      <HostBreadcrumb label={t("nav.backToToday")} locale={safeLocale} />
      <p style={labelStyle}>{t("activity.eyebrow")}</p>
      <h1 style={pageHeadingStyle}>{t("activity.title")}</h1>
      <div style={{ ...panelStyle, marginTop: "1.25rem" }}>
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
                  <strong>
                    {t(
                      `activityKinds.${activityKindLabelKey(activity.kind) ?? "other"}`,
                    )}
                  </strong>
                  <p style={{ color: graphite, lineHeight: 1.5, margin: "0.2rem 0 0" }}>
                    {activityDetail(activity, safeLocale, t)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ color: graphite, margin: 0 }}>{t("activity.empty")}</p>
        )}
      </div>
    </>
  );
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
  if (activity.kind === "household_policy_updated")
    return t("activity.policyUpdatedDetail");
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
      decision: key ? t(`activityPolicies.${key}`) : t("activityPolicies.other"),
    });
  }
  return `${t("activity.noDetail")} · ${new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
  }).format(new Date(activity.created_at))}`;
}
