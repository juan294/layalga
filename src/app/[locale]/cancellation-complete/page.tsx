import { getTranslations, setRequestLocale } from "next-intl/server";
import styles from "@/components/guest/guest-ledger.module.css";

export default async function CancellationComplete({
  params,
}: {
  params: Promise<{ locale: "en" | "es" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Cancellation" });
  return (
    <main className={styles.shell}>
      <article className={styles.ledger}>
        <header className={styles.header}>
          <h1>{t("doneTitle")}</h1>
        </header>
        <div className={styles.body}>
          <p>{t("doneBody")}</p>
          <a href={`/${locale}/visits`}>{t("account")}</a>
        </div>
      </article>
    </main>
  );
}
