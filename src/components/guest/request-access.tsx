import { getTranslations } from "next-intl/server";
import { SignInButton } from "@/app/[locale]/sign-in/sign-in-button";
import type { AppLocale } from "@/i18n/routing";
import styles from "./guest-ledger.module.css";

export async function RequestAccess({
  locale,
  nextPath,
  failed,
}: {
  locale: AppLocale;
  nextPath: string;
  failed: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "StayRequests" });
  return (
    <>
      <p>{t("accountHelp")}</p>
      {failed && <p role="alert">{t("authFailed")}</p>}
      <SignInButton
        locale={locale}
        nextPath={nextPath}
        label={t("signIn")}
        className={styles.primaryButton}
      />
    </>
  );
}
