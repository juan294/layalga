"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { MAX_GUEST_MESSAGE_LENGTH } from "@/agent/task-limits";
import type {
  GuestChangeAction,
  GuestChangeState,
} from "@/core/booking/guest-action-input";

import styles from "./guest-ledger.module.css";
import { GuestActionButton } from "./guest-action-button";

const initialState: GuestChangeState = { status: "idle" };

export function GuestChangeForm({
  token,
  locale,
  action,
}: {
  token?: string;
  locale: "en" | "es";
  action: GuestChangeAction;
}) {
  const t = useTranslations("Guest");
  const [state, formAction] = useActionState(action, initialState);
  const [message, setMessage] = useState("");
  const invalid = state.status === "error";

  return (
    <form action={formAction} className={styles.changeForm}>
      {token ? <input name="token" type="hidden" value={token} /> : null}
      <input name="locale" type="hidden" value={locale} />
      <label className={styles.field} htmlFor="guest-change-message">
        <span>{t("requestChangeTitle")}</span>
        <textarea
          aria-describedby={
            invalid
              ? "guest-change-help guest-change-error"
              : "guest-change-help"
          }
          aria-invalid={invalid ? true : undefined}
          id="guest-change-message"
          maxLength={MAX_GUEST_MESSAGE_LENGTH}
          name="message"
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t("requestChangePlaceholder")}
          required
          rows={3}
          value={message}
        />
      </label>
      <small id="guest-change-help">
        {t("requestChangeLimit", { max: MAX_GUEST_MESSAGE_LENGTH })}
      </small>
      {state.status === "error" ? (
        <p className={styles.notice} id="guest-change-error" role="alert">
          {state.error === "empty"
            ? t("requestChangeEmpty")
            : t("requestChangeTooLong", { max: MAX_GUEST_MESSAGE_LENGTH })}
        </p>
      ) : null}
      <GuestActionButton
        className={styles.secondaryButton}
        label={t("requestChange")}
        pendingLabel={t("requestingChange")}
        testId="request-change"
      />
    </form>
  );
}
