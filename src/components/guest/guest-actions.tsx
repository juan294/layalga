import { getTranslations } from "next-intl/server";

import type { GuestFormAction } from "@/core/booking/guest-actions";

import styles from "./guest-ledger.module.css";
import { GuestActionButton } from "./guest-action-button";

interface GuestActionsProps {
  token?: string;
  locale: "en" | "es";
  canReconfirm?: boolean;
  reconfirmAction: GuestFormAction;
  requestChangeAction: GuestFormAction;
}

export async function GuestActions({
  token,
  locale,
  canReconfirm = false,
  reconfirmAction,
  requestChangeAction,
}: GuestActionsProps) {
  const t = await getTranslations({ locale, namespace: "Guest" });

  return (
    <div className={styles.actionStack}>
      {canReconfirm ? (
        <form action={reconfirmAction}>
          {token ? <input name="token" type="hidden" value={token} /> : null}
          <input name="locale" type="hidden" value={locale} />
          <GuestActionButton
            className={styles.primaryButton}
            label={t("reconfirmYes")}
            pendingLabel={t("reconfirming")}
            testId="reconfirm-yes"
          />
        </form>
      ) : null}
      <form action={requestChangeAction} className={styles.changeForm}>
        {token ? <input name="token" type="hidden" value={token} /> : null}
        <input name="locale" type="hidden" value={locale} />
        <label className={styles.field} htmlFor="guest-change-message">
          <span>{t("requestChangeTitle")}</span>
          <textarea
            id="guest-change-message"
            name="message"
            placeholder={t("requestChangePlaceholder")}
            required
            rows={3}
          />
        </label>
        <GuestActionButton
          className={styles.secondaryButton}
          label={t("requestChange")}
          pendingLabel={t("requestingChange")}
          testId="request-change"
        />
      </form>
    </div>
  );
}
