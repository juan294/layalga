import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getRequesterStayRequest } from "@/core/booking/stay-requests";
import { getAuthUser } from "@/lib/auth/current-user";
import { verifiedGoogleGuestEmail } from "@/lib/auth/verified-guest-email";
import { RequestShell } from "@/components/guest/request-shell";
import { RequestAccess } from "@/components/guest/request-access";
import { RequestTerms } from "@/components/guest/request-terms";
import { WithdrawStayRequest } from "@/components/guest/withdraw-stay-request";
import type { AppLocale } from "@/i18n/routing";

export default async function RequestReceipt({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale; id: string }>;
  searchParams: Promise<{ auth?: string }>;
}) {
  const { locale, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const path = `/${locale}/requests/${id}`;
  const t = await getTranslations({ locale, namespace: "StayRequests" });
  const user = await getAuthUser();
  if (!user || !verifiedGoogleGuestEmail(user))
    return (
      <RequestShell title={t("receipt")}>
        <RequestAccess
          locale={locale}
          nextPath={path}
          failed={(await searchParams).auth === "failed"}
        />
      </RequestShell>
    );
  const record = await getRequesterStayRequest(user.id, id).catch(
    () => undefined,
  );
  if (record === null) notFound();
  return (
    <RequestShell title={t("receipt")}>
      {record === undefined ? (
        <p role="alert">{t("unavailable")}</p>
      ) : (
        <>
          <p role="status">
            <strong>{t(`status.${record.status}`)}</strong>
          </p>
          {record.status === "pending" && <p>{t("pendingHelp")}</p>}
          <RequestTerms locale={locale} record={record} />
          {record.status === "pending" && <WithdrawStayRequest id={id} />}
          {record.status === "confirmed" && record.visitId && (
            <p>
              <Link href={`/${locale}/visits#visit-${record.visitId}`}>
                {t("viewVisit")}
              </Link>
            </p>
          )}
          {record.status !== "pending" && record.status !== "confirmed" && (
            <p>
              <Link href={`/${locale}/stays/${record.handle}`}>
                {t("findAnother")}
              </Link>
            </p>
          )}
        </>
      )}
      <p>
        <a href={path}>{t("refresh")}</a>
      </p>
      <p>
        <Link href={`/${locale}/requests`}>{t("history")}</Link>
      </p>
    </RequestShell>
  );
}
