import Link from "next/link";
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
  return (
    <RequestShell title={t("review")}>
      <RequestReview
        locale={locale}
        email={verifiedGoogleGuestEmail(await getAuthUser())}
        authFailed={(await searchParams).auth === "failed"}
      />
      <p>
        <Link href={`/${locale}/requests`}>{t("history")}</Link>
      </p>
    </RequestShell>
  );
}
