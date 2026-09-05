"use client";

import { useTranslations } from "next-intl";

import type { RoomPreferenceExplanation as Explanation } from "@/core/rooms/preferences";
import styles from "./guest-ledger.module.css";

export function RoomPreferenceExplanation({
  explanation,
  selectionChanged,
}: {
  explanation: Explanation;
  selectionChanged: boolean;
}) {
  const t = useTranslations("Guest.roomPreferences");
  const groundFloorRelevant =
    explanation.matched.includes("ground_floor") ||
    explanation.unmatched.includes("ground_floor");

  return (
    <aside
      className={styles.sharedNote}
      data-testid="room-preference-explanation"
    >
      <h3>{t("title")}</h3>
      {explanation.status !== "available" ? (
        <p>{t(explanation.status)}</p>
      ) : null}
      {explanation.matched.length > 0 ? (
        <p>
          {t("matched", {
            preferences: explanation.matched
              .map((preference) => t(`labels.${preference}`))
              .join(", "),
          })}
        </p>
      ) : null}
      {explanation.unmatched.length > 0 ? (
        <p>
          {t("unmatched", {
            preferences: explanation.unmatched
              .map((preference) => t(`labels.${preference}`))
              .join(", "),
          })}
        </p>
      ) : null}
      <p>{t("choice")}</p>
      {selectionChanged ? <p>{t("selectionChanged")}</p> : null}
      {groundFloorRelevant ? <p>{t("groundFloor")}</p> : null}
    </aside>
  );
}
