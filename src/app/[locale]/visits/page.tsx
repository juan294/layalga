import { AccountPendingInvitations } from "@/components/guest/account-pending-invitations";
import { CancellationReview } from "@/components/guest/cancellation-review";
import { cancelAccountVisit } from "./actions";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SignInButton } from "@/app/[locale]/sign-in/sign-in-button";
import { formatDateStay } from "@/components/frontend-utils";
import { loadGuestAccountVisits } from "@/lib/auth/guest-account";
import { createClient } from "@/lib/supabase/server";
import styles from "@/components/guest/guest-ledger.module.css";

export default async function GuestAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "en" | "es" }>;
  searchParams: Promise<{
    account?: string;
    cancel?: string;
    visit?: string;
    invitation?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "GuestAccount" });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cancellation = await searchParams;
  const accountError = (await searchParams).account === "not_found";
  const visits = user ? await loadGuestAccountVisits(user.id) : [];

  return (
    <main className={styles.shell}>
      <article className={styles.ledger}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{t("eyebrow")}</p>
            <h1 className={styles.title}>{t("title")}</h1>
          </div>
        </header>
        <div className={styles.body}>
          {!user ? (
            <div className={styles.claim}>
              <p>{t("signInBody")}</p>
              <SignInButton
                className={styles.secondaryButton}
                label={t("signIn")}
                locale={locale}
                nextPath={`/${locale}/visits`}
              />
              {accountError ? <p role="alert">{t("notFound")}</p> : null}
            </div>
          ) : visits.length ? (
            <ol className={styles.accountVisits}>
              {visits.map((visit) => (
                <li key={visit.id}>
                  <strong>{visit.partyName}</strong>
                  <span>{formatDateStay(visit.stay, locale)}</span>
                  <small>{t(`status.${visit.status}`)}</small>
                  {visit.status !== "cancelled" ? (
                    <CancellationReview
                      locale={locale}
                      action={cancelAccountVisit}
                      visit={visit}
                      changed={
                        cancellation.cancel === "changed" &&
                        cancellation.visit === visit.id
                      }
                      open={
                        cancellation.cancel === "changed" &&
                        cancellation.visit === visit.id
                      }
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p>{t("empty")}</p>
          )}
          {user ? (
            <AccountPendingInvitations
              userId={user.id}
              locale={locale}
              action={cancelAccountVisit}
              changedInvitation={
                cancellation.cancel === "changed"
                  ? cancellation.invitation
                  : undefined
              }
            />
          ) : null}
          {user ? (
            <form action="/auth/sign-out" method="post">
              <input name="locale" type="hidden" value={locale} />
              <button className={styles.secondaryButton} type="submit">
                {t("signOut")}
              </button>
            </form>
          ) : null}
        </div>
      </article>
    </main>
  );
}
