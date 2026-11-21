import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { getHostStayRequestOutcome } from "@/core/booking/stay-requests";
import { SignInButton } from "@/app/[locale]/sign-in/sign-in-button";
import { RequestShell } from "@/components/guest/request-shell";
import { getCurrentHost } from "@/lib/auth/current-host";

export default async function ReviewStay({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if ((locale !== "en" && locale !== "es") || !z.uuid().safeParse(id).success)
    notFound();
  const t = await getTranslations({ locale, namespace: "StayRequests" });
  const host = await getCurrentHost();
  if (host) {
    const outcome = await getHostStayRequestOutcome(host, id);
    if (!outcome) notFound();
    if (outcome.status === "pending")
      redirect(`/${locale}#stay-request-${id.toLowerCase()}`);
    const hostT = await getTranslations({
      locale,
      namespace: "HostStayRequests",
    });
    const visitT = await getTranslations({ locale, namespace: "GuestAccount" });
    return (
      <RequestShell title={t("receipt")}>
        <p role="status">
          {t(`status.${outcome.status}`)}{" "}
          {outcome.actor && hostT("decidedBy", { name: outcome.actor })}
        </p>
        {outcome.visitStatus && outcome.visitStatus !== "confirmed" && (
          <p>
            {hostT("currentVisit", {
              status: visitT(`status.${outcome.visitStatus}`),
            })}
          </p>
        )}
        <Link href={`/${locale}`}>{hostT("dashboard")}</Link>
      </RequestShell>
    );
  }
  return (
    <RequestShell title={t("review")}>
      <SignInButton locale={locale} nextPath={`/${locale}/review-stay/${id}`} />
    </RequestShell>
  );
}
