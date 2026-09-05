import { getTranslations, setRequestLocale } from "next-intl/server";
import styles from "@/components/guest/guest-ledger.module.css";

export default async function GuestEmailStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "en" | "es" }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "GuestEmail" });
  const state =
    (await searchParams).state === "unverified" ? "unverified" : "disabled";
  return (
    <main className={styles.shell}>
      <article className={styles.ledger}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("preferencesTitle")}</h1>
        </header>
        <div className={styles.body}>
          <p role="status">{t(state)}</p>
          <a className={styles.secondaryButton} href={`/${locale}/visits`}>
            {t("openAccount")}
          </a>
        </div>
      </article>
    </main>
  );
}
