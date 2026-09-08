import { getTranslations } from "next-intl/server";

import { getDatabaseConnection, sqlClient } from "@/core/db/client";
import { maskHostEmail } from "@/lib/auth/host-emails";
import { HostBreadcrumb } from "@/components/host/host-breadcrumb";
import { HouseholdPolicyPanel } from "@/components/host/household-policy-panel";
import {
  buttonStyle,
  graphite,
  headingStyle,
  labelStyle,
  pageHeadingStyle,
  panelStyle,
  sectionGridStyle,
} from "@/components/host/host-styles";
import { updateEmailPingsAction } from "../actions";
import { loadHostContext } from "../host-context";

export default async function HostSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { host, locale: safeLocale } = await loadHostContext(locale);
  const t = await getTranslations({ locale: safeLocale, namespace: "Host" });
  const sql = sqlClient(getDatabaseConnection().db);
  const [emailPingsSetting] = await sql<
    { normalized_email: string | null; email_pings: boolean | null }[]
  >`
    select claim.normalized_email, settings.email_pings
    from public.hosts host
    left join public.host_identity_claims claim on claim.host_id = host.id
    left join public.host_notification_settings settings
      on settings.host_id = host.id
    where host.id = ${host.id}
    order by claim.normalized_email
    limit 1
  `;
  const maskedEmail = emailPingsSetting?.normalized_email
    ? maskHostEmail(emailPingsSetting.normalized_email)
    : null;
  const emailPingsEnabled = emailPingsSetting?.email_pings ?? true;

  return (
    <>
      <HostBreadcrumb label={t("nav.backToToday")} locale={safeLocale} />
      <p style={labelStyle}>{t("settings.eyebrow")}</p>
      <h1 style={pageHeadingStyle}>{t("settings.title")}</h1>
      <div style={sectionGridStyle}>
        <section style={panelStyle}>
          <p style={labelStyle}>{t("emailPings.eyebrow")}</p>
          <h2 style={headingStyle}>{t("emailPings.title")}</h2>
          {maskedEmail ? (
            <>
              <p style={{ color: graphite, lineHeight: 1.6, margin: "0 0 1rem" }}>
                {t("emailPings.description", { address: maskedEmail })}
              </p>
              <form action={updateEmailPingsAction}>
                <input name="locale" type="hidden" value={safeLocale} />
                <input
                  name="emailPings"
                  type="hidden"
                  value={emailPingsEnabled ? "false" : "true"}
                />
                <button style={buttonStyle} type="submit">
                  {emailPingsEnabled
                    ? t("emailPings.turnOff")
                    : t("emailPings.turnOn")}
                </button>
              </form>
              <p style={{ color: graphite, margin: "0.75rem 0 0" }}>
                {emailPingsEnabled
                  ? t("emailPings.statusOn")
                  : t("emailPings.statusOff")}
              </p>
            </>
          ) : (
            <p style={{ color: graphite, margin: 0 }}>{t("emailPings.noAddress")}</p>
          )}
        </section>

        <HouseholdPolicyPanel
          homeId={host.homeId}
          hostId={host.id}
          locale={safeLocale}
        />
      </div>
    </>
  );
}
