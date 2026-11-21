import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/auth/current-user";
import { verifiedGoogleGuestEmail } from "@/lib/auth/verified-guest-email";
import { RequestShell } from "@/components/guest/request-shell";
import { RequestAccess } from "@/components/guest/request-access";
import { listRequesterStayRequests } from "@/core/booking/stay-requests";
import { formatDateStay } from "@/components/frontend-utils";
import type { AppLocale } from "@/i18n/routing";
import styles from "@/components/guest/guest-ledger.module.css";

export default async function RequestHistory({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ auth?: string }>;
}) {
  const { locale } = await params;
  const path = `/${locale}/requests`;
  const t = await getTranslations({ locale, namespace: "StayRequests" });
  const account = await getTranslations({ locale, namespace: "GuestAccount" });
  const user = await getAuthUser();
  if (!user || !verifiedGoogleGuestEmail(user))
    return (
      <RequestShell title={t("history")}>
        <RequestAccess
          locale={locale}
          nextPath={path}
          failed={(await searchParams).auth === "failed"}
        />
      </RequestShell>
    );
  const requests = await listRequesterStayRequests(user.id).catch(() => null);
  return (
    <RequestShell title={t("history")}>
      {requests === null ? (
        <p role="alert">
          {t("unavailable")} <a href={path}>{t("retry")}</a>
        </p>
      ) : requests.length ? (
        <ul className={styles.accountVisits}>
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`${path}/${r.id}`}>
                {r.displayName} · {formatDateStay(r.stay, locale)}
              </Link>{" "}
              <span>
                {r.visitStatus
                  ? account(`status.${r.visitStatus}`)
                  : t(`status.${r.status}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("empty")}</p>
      )}
      <p>
        <Link href={`/${locale}/stays`}>{t("findAnother")}</Link>
      </p>
    </RequestShell>
  );
}
