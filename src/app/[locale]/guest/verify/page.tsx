import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SystemClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import { inspectGuestVerification } from "@/core/notifications/guest-contact";
import { GuestActionButton } from "@/components/guest/guest-action-button";
import styles from "@/components/guest/guest-ledger.module.css";
import { confirmGuestEmail } from "../email-actions";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VerifyGuestEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "en" | "es" }>;
  searchParams: Promise<{ capability?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const capability = (await searchParams).capability ?? "";
  const review = await inspectGuestVerification(
    getDatabaseConnection().db,
    capability,
    new SystemClock(),
  );
  const t = await getTranslations({ locale, namespace: "GuestEmail" });
  return (
    <main className={styles.shell}>
      <article
        className={styles.ledger}
        data-testid="guest-email-verification"
        data-valid={Boolean(review)}
      >
        <header className={styles.header}>
          <h1 className={styles.title}>
            {t(review ? "verifyTitle" : "invalidLinkTitle")}
          </h1>
        </header>
        <div className={styles.body}>
          <p className={styles.lede}>
            {t(review ? "verifyBody" : "invalidLinkBody")}
          </p>
          {review ? (
            <form action={confirmGuestEmail.bind(null, locale)}>
              <input type="hidden" name="capability" value={capability} />
              <GuestActionButton
                className={styles.primaryButton}
                label={t("verify")}
                pendingLabel={t("pending")}
                testId="guest-email-verify"
              />
            </form>
          ) : (
            <a className={styles.secondaryButton} href={`/${locale}/visits`}>
              {t("openAccount")}
            </a>
          )}
        </div>
      </article>
    </main>
  );
}
