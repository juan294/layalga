import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SignInButton } from "@/app/[locale]/sign-in/sign-in-button";
import { ASSISTANTS } from "@/components/guest/assistant-names";
import { ConnectedAssistants } from "@/components/guest/connected-assistants";
import styles from "@/components/guest/guest-ledger.module.css";
import { RequestShell } from "@/components/guest/request-shell";
import { getDatabaseConnection } from "@/core/db/client";
import type { AppLocale } from "@/i18n/routing";
import { listConnections } from "@/lib/auth/connected-assistants";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AssistantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ auth?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const path = `/${locale}/assistants`;
  const t = await getTranslations({ locale, namespace: "Assistants" });
  const list = await listConnections({
    database: getDatabaseConnection().db,
    supabase: await createClient(),
  });
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  return (
    <RequestShell title={t("navigation")}>
      <div className={styles.formStack}>
        <p>{t("list.intro")}</p>
        {list.status === "ok" && (
          <ConnectedAssistants
            connections={list.connections.map(
              ({ clientId, assistant, clientName, connectedAt }) => ({
                clientId,
                name: assistant ? ASSISTANTS[assistant].name : clientName,
                recognized: assistant !== null,
                connectedOn: date.format(new Date(connectedAt)),
              }),
            )}
          />
        )}
        {list.status === "sign_in" && (
          <>
            <p>{t("list.signInHelp")}</p>
            {(await searchParams).auth === "failed" && (
              <p role="alert">{t("authFailed")}</p>
            )}
            <SignInButton
              locale={locale}
              nextPath={path}
              label={t("signIn")}
              className={styles.primaryButton}
            />
          </>
        )}
        {list.status === "off" && <p role="status">{t("list.off")}</p>}
        {list.status === "unavailable" && (
          <div role="alert">
            <p>{t("list.unavailable")}</p>
            <a className={styles.actionLink} href={path}>
              {t("retry")}
            </a>
          </div>
        )}
        <section>
          <h2 className={styles.factTitle}>{t("list.notesTitle")}</h2>
          <ul className={styles.plainList}>
            <li>{t("list.noteAtOnce")}</li>
            <li>{t("list.noteSignOut")}</li>
            <li>{t("list.noteStale")}</li>
            <li>{t("list.noteClaudeCode")}</li>
          </ul>
        </section>
      </div>
    </RequestShell>
  );
}
