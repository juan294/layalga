import { GuestEmailPreferences } from "@/components/guest/guest-email-preferences";
import { CancellationReview } from "@/components/guest/cancellation-review";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SignInButton } from "@/app/[locale]/sign-in/sign-in-button";
import { GuestShell } from "@/components/guest/guest-shell";
import { loadGuestInvitationDefaults } from "@/components/guest/load-guest-invitation-defaults";
import { DemoGuestGuide } from "@/components/guest/demo-guest-guide";
import { GuestInviteForm } from "@/components/guest/guest-invite-form";
import styles from "@/components/guest/guest-ledger.module.css";
import { graphite } from "@/components/host/host-styles";
import { householdSeason } from "@/lib/season";
import { guestVisitPresentation } from "@/components/guest/guest-visit-presentation";
import { GuestVisitRecord } from "@/components/guest/guest-visit-record";
import { loadGuestInvitation } from "@/core/booking/guest-invitation";
import { partyIsClaimedByUser } from "@/lib/auth/guest-account";
import { createClient } from "@/lib/supabase/server";

import {
  cancelGuest,
  findGuestOptions,
  reconfirmGuest,
  requestGuestChange,
  submitGuestVisit,
} from "./actions";

interface GuestPageProps {
  params: Promise<{ locale: "en" | "es"; token: string }>;
  searchParams: Promise<{ claim?: string; cancel?: string; email?: string }>;
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

  const cancellationState = (await searchParams).cancel;
  const cancellationReview =
    cancellationState === "review" || cancellationState === "changed";
  const status = invitation.visit?.status ?? "invited";
  const presentation = invitation.visit
    ? guestVisitPresentation(invitation.visit)
    : null;
  const statusKey = presentation?.statusKey ?? status;
  const title = t(`${statusKey}Title`);
  const { defaults, demo, now, timeZone } = await loadGuestInvitationDefaults(
    invitation.homeId,
    invitation.structured,
  );
  const showDemo = process.env.DEMO_MODE === "true" && demo;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const claimed = user
    ? await partyIsClaimedByUser(invitation.partyId, user.id)
    : false;

  return (
    <GuestShell
      demoGuide={
        showDemo ? (
          <DemoGuestGuide invitationId={invitation.id} locale={locale} />
        ) : null
      }
      locale={locale}
      managePanel={
        <>
          <GuestEmailPreferences
            locale={locale}
            context={{ kind: "token", token }}
            feedback={(await searchParams).email}
          />
          <CancellationReview
            locale={locale}
            action={cancelGuest}
            visit={
              invitation.visit?.status === "cancelled" ? null : invitation.visit
            }
            anchorId="cancel-request"
            changed={cancellationState === "changed"}
            open={cancellationReview}
            token={token}
          />
          <p style={{ color: graphite, lineHeight: 1.6, margin: "1rem 0 0" }}>
            {t("manage.helper")}
          </p>

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
        </>
      }
      partyName={invitation.partyName}
      primaryPanel={
        status === "invited" ? (
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
        ) : null
      }
      season={householdSeason(now, timeZone)}
      showDemo={showDemo}
      status={status}
      statusKey={statusKey}
      title={title}
    />
  );
}
