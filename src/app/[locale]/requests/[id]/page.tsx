import { ReceiptRegistration } from "@/components/webmcp/receipt-registration";
import { GuestVisitRecord } from "@/components/guest/guest-visit-record";
import { CancellationReview } from "@/components/guest/cancellation-review";
import { loadRequestedVisit } from "@/core/booking/requested-visit";
import { cancelAccountVisit } from "../../visits/actions";
import {
  changeRequestedVisit,
  reconfirmRequestedVisit,
} from "../visit-actions";
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
  searchParams: Promise<{ auth?: string; cancel?: string; withdraw?: string }>;
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
  const live =
    record?.status === "confirmed"
      ? await loadRequestedVisit(user.id, id, locale).catch(() => null)
      : null;
  const account = await getTranslations({ locale, namespace: "GuestAccount" });
  return (
    <RequestShell title={t("receipt")}>
      {record === undefined ||
      (record.status === "confirmed" && !live?.visit) ? (
        <p role="alert">
          {t("unavailable")} <a href={path}>{t("retry")}</a>
        </p>
      ) : (
        <>
          <ReceiptRegistration id={id} />
          <p role="status">
            <strong>
              {live?.visit
                ? account(`status.${live.visit.status}`)
                : t(`status.${record.status}`)}
            </strong>
          </p>
          {record.status === "pending" && <p>{t("pendingHelp")}</p>}
          {live?.visit ? (
            <>
              <GuestVisitRecord
                locale={locale}
                visit={live.visit}
                reconfirmAction={reconfirmRequestedVisit.bind(null, id)}
                requestChangeAction={changeRequestedVisit.bind(null, id)}
              />
              {live.visit.status !== "cancelled" && (
                <CancellationReview
                  locale={locale}
                  visit={live.visit}
                  action={cancelAccountVisit}
                  anchorId="cancel-request"
                  open={(await searchParams).cancel === "review"}
                />
              )}
            </>
          ) : (
            <RequestTerms locale={locale} record={record} />
          )}
          {record.status === "pending" && (
            <WithdrawStayRequest
              id={id}
              locale={locale}
              retry={(await searchParams).withdraw === "retry"}
            />
          )}
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
