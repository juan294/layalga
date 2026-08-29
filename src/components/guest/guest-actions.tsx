import { getTranslations } from "next-intl/server";

import {
  reconfirmGuest,
  requestGuestChange,
} from "@/app/[locale]/g/[token]/actions";

import styles from "./guest-ledger.module.css";
import { GuestActionButton } from "./guest-action-button";

interface GuestActionsProps {
  token: string;
  locale: "en" | "es";
  canReconfirm?: boolean;
}

export async function GuestActions({
  token,
  locale,
  canReconfirm = false,
}: GuestActionsProps) {
  const t = await getTranslations({ locale, namespace: "Guest" });

  return (
    <div className={styles.actionStack}>
      {canReconfirm ? (
        <form action={reconfirmGuest}>
          <input name="token" type="hidden" value={token} />
          <input name="locale" type="hidden" value={locale} />
          <GuestActionButton
            className={styles.primaryButton}
            label={t("reconfirmYes")}
            pendingLabel={t("reconfirming")}
            testId="reconfirm-yes"
          />
        </form>
      ) : null}
      <form action={requestGuestChange} className={styles.changeForm}>
        <input name="token" type="hidden" value={token} />
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
