import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import styles from "@/components/guest/guest-ledger.module.css";
import { routing } from "@/i18n/routing";

/** Section keys of the `Privacy` messages, in reading order. */
export const PRIVACY_SECTIONS = [
  "signIn",
  "household",
  "assistant",
  "services",
  "retention",
  "choices",
] as const;

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

  return (
    <main className={styles.shell}>
      <article className={styles.ledger}>
        <header className={styles.header}>
          <h1>{t("title")}</h1>
        </header>
        <div className={styles.body}>
          <p>{t("updated")}</p>
          <p>{t("intro")}</p>
          {PRIVACY_SECTIONS.map((section) => (
            <section key={section}>
              <h2>{t(`${section}Title`)}</h2>
              <p>{t(`${section}Body`)}</p>
            </section>
          ))}
          <a href={`/${locale}/sign-in`}>{t("backToSignIn")}</a>
        </div>
      </article>
    </main>
  );
}
