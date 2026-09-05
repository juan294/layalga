import { getTranslations } from "next-intl/server";
import { formatDateStay } from "@/components/frontend-utils";
import { GuestActionButton } from "./guest-action-button";
import styles from "./guest-ledger.module.css";

export async function CancellationReview({
  locale,
  action,
  token,
  invitationId,
  visit,
  open = false,
  changed = false,
  anchorId,
}: {
  locale: "en" | "es";
  action: (formData: FormData) => Promise<void>;
  token?: string;
  invitationId?: string;
  visit?: { id: string; stay: readonly [string, string] } | null;
  open?: boolean;
  changed?: boolean;
  anchorId?: string;
}) {
  const t = await getTranslations({ locale, namespace: "Cancellation" });
  return (
    <details
      id={anchorId ?? `cancel-${invitationId ?? visit?.id ?? "request"}`}
      open={open}
      className={styles.changeForm}
    >
      <summary className={styles.cancellationToggle}>{t(visit ? "openVisit" : "openRequest")}</summary>
      <form action={action} className={styles.actionStack}>
        <input type="hidden" name="locale" value={locale} />
        {token ? <input type="hidden" name="token" value={token} /> : null}
        {invitationId ? (
          <input type="hidden" name="invitationId" value={invitationId} />
        ) : null}
        <input type="hidden" name="expectedVisitId" value={visit?.id ?? ""} />
        <input
          type="hidden"
          name="expectedStay"
          value={visit?.stay.join("|") ?? ""}
        />
        <p>
          {visit
            ? t("visitReview", { stay: formatDateStay(visit.stay, locale) })
            : t("requestReview")}
        </p>
        {changed ? <p role="alert">{t("changed")}</p> : null}
        <p>{t("consequence")}</p>
        <label className={styles.consent}>
          <input type="checkbox" name="confirmed" value="yes" required />{" "}
          {t("confirmLabel")}
        </label>
        <GuestActionButton
          className={styles.secondaryButton}
          label={t("confirm")}
          pendingLabel={t("pending")}
          testId="confirm-cancellation"
        />
        <p>{t("keep")}</p>
      </form>
    </details>
  );
}
