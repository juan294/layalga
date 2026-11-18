import { getTranslations } from "next-intl/server";

import type { GuestChangeAction } from "@/core/booking/guest-action-input";
import type { GuestFormAction } from "@/core/booking/guest-actions";

import styles from "./guest-ledger.module.css";
import { GuestActionButton } from "./guest-action-button";
import { GuestChangeForm } from "./guest-change-form";

interface GuestActionsProps {
  token?: string;
  locale: "en" | "es";
  canReconfirm?: boolean;
  reconfirmAction: GuestFormAction;
  requestChangeAction: GuestChangeAction;
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
      <GuestChangeForm
        action={requestChangeAction}
        locale={locale}
        token={token}
      />
    </div>
  );
}
