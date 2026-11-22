import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { RequestShell } from "@/components/guest/request-shell";
import { RequestReview } from "@/components/guest/request-review";
import { getAuthUser } from "@/lib/auth/current-user";
import { verifiedGoogleGuestEmail } from "@/lib/auth/verified-guest-email";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ auth?: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "StayRequests" });
  const email = verifiedGoogleGuestEmail(await getAuthUser());
  return (
    <RequestShell title={t("review")}>
      <RequestReview
        key={email}
        locale={locale}
        email={email}
        authFailed={(await searchParams).auth === "failed"}
      />
    </RequestShell>
  );
}
