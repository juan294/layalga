import { GuestEmailPreferences } from "@/components/guest/guest-email-preferences";
import { CancellationReview } from "@/components/guest/cancellation-review";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { GuestInviteForm } from "@/components/guest/guest-invite-form";
import { loadGuestInvitationDefaults } from "@/components/guest/load-guest-invitation-defaults";
import { DemoGuestGuide } from "@/components/guest/demo-guest-guide";
import styles from "@/components/guest/guest-ledger.module.css";
import { guestVisitPresentation } from "@/components/guest/guest-visit-presentation";
import { GuestVisitRecord } from "@/components/guest/guest-visit-record";
import { loadGuestInvitation } from "@/core/booking/guest-invitation";
import { getCurrentGuestInvitation } from "@/lib/auth/current-guest";

import {
  cancelGuestSession,
  findGuestOptionsSession,
  reconfirmGuestSession,
  requestGuestChangeSession,
  submitGuestVisitSession,
} from "./actions";

interface GuestSessionPageProps {
  params: Promise<{ locale: "en" | "es" }>;
  searchParams: Promise<{ cancel?: string; email?: string }>;
}

export default async function GuestSessionPage({
  params,
  searchParams,
}: GuestSessionPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCurrentGuestInvitation();
  if (!session) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "Guest" });
  const invitation = await loadGuestInvitation(
    { invitationId: session.invitationId },
    locale,
  );
  if (!invitation) redirect(`/${locale}/sign-in`);

  const cancellationState = (await searchParams).cancel;
  const cancellationReview =
    cancellationState === "review" || cancellationState === "changed";
  const status = invitation.visit?.status ?? "invited";
  const presentation = invitation.visit
    ? guestVisitPresentation(invitation.visit)
    : null;
  const statusKey = presentation?.statusKey ?? status;
  const title = t(`${statusKey}Title`);
  const { defaults, demo } = await loadGuestInvitationDefaults(
    invitation.homeId,
    invitation.structured,
  );

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

          {demo ? (
            <DemoGuestGuide invitationId={invitation.id} locale={locale} />
          ) : null}

          {status === "invited" ? (
            <GuestInviteForm
              defaults={defaults}
              findAction={findGuestOptionsSession}
              locale={locale}
              submitAction={submitGuestVisitSession}
            />
          ) : invitation.visit ? (
            <GuestVisitRecord
              locale={locale}
              reconfirmAction={reconfirmGuestSession}
              requestChangeAction={requestGuestChangeSession}
              visit={invitation.visit}
            />
          ) : null}

          <GuestEmailPreferences
            locale={locale}
            context={{ kind: "session" }}
            feedback={(await searchParams).email}
          />

          <CancellationReview
            locale={locale}
            action={cancelGuestSession}
            visit={
              invitation.visit?.status === "cancelled" ? null : invitation.visit
            }
            anchorId="cancel-request"
            changed={cancellationState === "changed"}
            open={cancellationReview}
          />
        </div>
      </article>
    </main>
  );
}
