import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import styles from "@/components/guest/guest-ledger.module.css";
import { routing } from "@/i18n/routing";
import { assistantAccessOn } from "@/lib/server/env";

/** Section keys of the `Privacy` messages, in reading order. */
const PRIVACY_SECTIONS = [
  "signIn",
  "household",
  "stayRequests",
  "assistant",
  "services",
  "retention",
  "choices",
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return { title: t("title") };
}

/**
 * The public privacy notice. Google links to it from the OAuth consent
 * screen, so it must render without a session.
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Privacy" });
  // The assistant section applies only once assistants can connect.
  const assistants = assistantAccessOn();

  return (
    <main className={styles.shell}>
      <article className={styles.ledger}>
        <header className={styles.header}>
          <h1>{t("title")}</h1>
        </header>
        <div className={styles.body}>
          <p>{t(assistants ? "updatedAssistants" : "updated")}</p>
          <p>{t("intro")}</p>
          {PRIVACY_SECTIONS.map((section) => (
            <Fragment key={section}>
              <section>
                <h2>{t(`${section}Title`)}</h2>
                <p>{t(`${section}Body`)}</p>
              </section>
              {section === "assistant" && assistants && (
                <section>
                  <h2>{t("connectedAssistantsTitle")}</h2>
                  <p>{t("connectedAssistantsBody")}</p>
                  <p>
                    <a href={`/${locale}/assistants`}>
                      {t("connectedAssistantsLink")}
                    </a>
                  </p>
                </section>
              )}
            </Fragment>
          ))}
          <a href={`/${locale}/sign-in`}>{t("backToSignIn")}</a>
        </div>
      </article>
    </main>
  );
}
