import { GuestEmailPreferences } from "@/components/guest/guest-email-preferences";
import { CancellationReview } from "@/components/guest/cancellation-review";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { GuestInviteForm } from "@/components/guest/guest-invite-form";
import { GuestShell } from "@/components/guest/guest-shell";
import { loadGuestInvitationDefaults } from "@/components/guest/load-guest-invitation-defaults";
import { DemoGuestGuide } from "@/components/guest/demo-guest-guide";
import { graphite } from "@/components/host/host-styles";
import { householdSeason } from "@/lib/season";
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
  const { defaults, demo, now, timeZone } = await loadGuestInvitationDefaults(
    invitation.homeId,
    invitation.structured,
  );
  const showDemo = process.env.DEMO_MODE === "true" && demo;

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
          <p style={{ color: graphite, lineHeight: 1.6, margin: "1rem 0 0" }}>
            {t("manage.helper")}
          </p>
        </>
      }
      partyName={invitation.partyName}
      primaryPanel={
        status === "invited" ? (
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
