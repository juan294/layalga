import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { withdrawMyRequest } from "@/app/[locale]/requests/actions";
import { GuestActionButton } from "./guest-action-button";
import styles from "./guest-ledger.module.css";

export async function WithdrawStayRequest({
  id,
  locale,
  retry,
}: {
  id: string;
  locale: AppLocale;
  retry: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "StayRequests" });
  return (
    <form action={withdrawMyRequest.bind(null, id, locale)}>
      {retry && <p role="alert">{t("withdrawRetry")}</p>}
      <GuestActionButton
        className={styles.secondaryButton}
        label={t("withdraw")}
        pendingLabel={t("withdrawing")}
        testId="withdraw-stay-request"
      />
    </form>
  );
}
