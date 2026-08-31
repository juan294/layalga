"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  issueCalendarFeedAction,
  revokeCalendarFeedAction,
  type CalendarFeedActionState,
} from "@/app/[locale]/(host)/calendar-actions";

import styles from "./room-ledger.module.css";

const initialState: CalendarFeedActionState = { status: "idle" };

export function CalendarFeedControls({
  feeds,
  locale,
}: {
  feeds: { id: string; label: string; locale: "en" | "es" }[];
  locale: "en" | "es";
}) {
  const t = useTranslations("Host.rooms");
  const [state, action, pending] = useActionState(
    issueCalendarFeedAction,
    initialState,
  );
  return (
    <section className={styles.controlSection}>
      <h3>{t("feedsTitle")}</h3>
      <p>{t("feedsHelp")}</p>
      <form action={action} className={styles.inlineForm}>
        <input name="locale" type="hidden" value={locale} />
        <label>
          <span>{t("feedLabel")}</span>
          <input maxLength={120} name="label" required />
        </label>
        <button disabled={pending} type="submit">
          {pending ? t("working") : t("issueFeed")}
        </button>
      </form>
      {state.status === "success" ? (
        <div className={styles.secretResult} role="status">
          <strong>{t("copyFeedNow")}</strong>
          <code>{state.subscriptionUrl}</code>
        </div>
      ) : state.status === "error" ? (
        <p role="alert">{t("actionFailed")}</p>
      ) : null}
      {feeds.length ? (
        <ul className={styles.compactList}>
          {feeds.map((feed) => (
            <li key={feed.id}>
              <span>
                {feed.label} · {feed.locale.toUpperCase()}
              </span>
              <form action={revokeCalendarFeedAction}>
                <input name="locale" type="hidden" value={locale} />
                <input name="feedId" type="hidden" value={feed.id} />
                <button type="submit">{t("revoke")}</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("noFeeds")}</p>
      )}
    </section>
  );
}
