import { getTranslations, setRequestLocale } from "next-intl/server";

import { SignInButton } from "@/app/[locale]/sign-in/sign-in-button";
import { guestInvitationDefaults } from "@/components/guest/guest-invitation-defaults";
import { GuestInviteForm } from "@/components/guest/guest-invite-form";
import styles from "@/components/guest/guest-ledger.module.css";
import { guestVisitPresentation } from "@/components/guest/guest-visit-presentation";
import { GuestVisitRecord } from "@/components/guest/guest-visit-record";
import { loadGuestInvitation } from "@/core/booking/guest-invitation";
import { partyIsClaimedByUser } from "@/lib/auth/guest-account";
import { createClient } from "@/lib/supabase/server";

import {
  findGuestOptions,
  reconfirmGuest,
  requestGuestChange,
  submitGuestVisit,
} from "./actions";

interface GuestPageProps {
  params: Promise<{ locale: "en" | "es"; token: string }>;
  searchParams: Promise<{ claim?: string }>;
}

export default async function GuestPage({
  params,
  searchParams,
}: GuestPageProps) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Guest" });
  const invitation = await loadGuestInvitation({ token }, locale);
  const claimFailed = (await searchParams).claim === "failed";

  if (!invitation) {
    return (
      <main className={styles.shell}>
        <article
          className={styles.ledger}
          data-testid="guest-status"
          data-status="invalid"
        >
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>{t("eyebrow")}</p>
              <h1 className={styles.title}>{t("invalidLinkTitle")}</h1>
            </div>
          </header>
          <div className={styles.body}>
            <p className={styles.lede}>{t("invalidLinkBody")}</p>
          </div>
        </article>
      </main>
    );
  }

  const status = invitation.visit?.status ?? "invited";
  const presentation = invitation.visit
    ? guestVisitPresentation(invitation.visit)
    : null;
  const statusKey = presentation?.statusKey ?? status;
  const title = t(`${statusKey}Title`);
  const defaults = guestInvitationDefaults(invitation.structured);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const claimed = user
    ? await partyIsClaimedByUser(invitation.partyId, user.id)
    : false;

  return (
    <main className={styles.shell}>
      <article
        className={styles.ledger}
        data-testid="guest-status"
        data-status={status}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{t("eyebrow")}</p>
            <h1 className={styles.title}>{title}</h1>
          </div>
          <span className={styles.stamp}>{t(`status.${statusKey}`)}</span>
        </header>
        <div className={styles.body}>
          <p className={styles.lede}>
            {t(status === "invited" ? "invitedBody" : "visitBody", {
              party: invitation.partyName,
            })}
          </p>

          {status === "invited" ? (
            <GuestInviteForm
              defaults={defaults}
              findAction={findGuestOptions}
              locale={locale}
              submitAction={submitGuestVisit}
              token={token}
            />
          ) : invitation.visit ? (
            <GuestVisitRecord
              locale={locale}
              reconfirmAction={reconfirmGuest}
              requestChangeAction={requestGuestChange}
              token={token}
              visit={invitation.visit}
            />
          ) : null}

          <aside className={styles.claim}>
            <div>
              <strong>
                {claimed ? t("claimComplete") : t("claimOptional")}
              </strong>
              <p>{claimed ? t("claimCompleteBody") : t("claimBenefit")}</p>
            </div>
            {claimed ? (
              <a className={styles.secondaryButton} href={`/${locale}/visits`}>
                {t("openAccount")}
              </a>
            ) : (
              <SignInButton
                className={styles.secondaryButton}
                label={t("claimWithGoogle")}
                locale={locale}
                nextPath={`/${locale}/g/${token}`}
              />
            )}
            {claimFailed ? <p role="alert">{t("claimFailed")}</p> : null}
          </aside>
        </div>
      </article>
    </main>
  );
}
