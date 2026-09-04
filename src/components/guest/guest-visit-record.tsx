import { getTranslations } from "next-intl/server";

import type { GuestFormAction } from "@/core/booking/guest-actions";
import type { GuestVisit } from "@/core/booking/guest-invitation";

import { formatDateStay, formatHouseholdDateTime } from "../frontend-utils";
import { GuestActions } from "./guest-actions";
import styles from "./guest-ledger.module.css";
import { guestVisitPresentation } from "./guest-visit-presentation";

interface GuestVisitRecordProps {
  locale: "en" | "es";
  reconfirmAction: GuestFormAction;
  requestChangeAction: GuestFormAction;
  token?: string;
  visit: GuestVisit;
}

export async function GuestVisitRecord({
  locale,
  reconfirmAction,
  requestChangeAction,
  token,
  visit,
}: GuestVisitRecordProps) {
  const t = await getTranslations({ locale, namespace: "Guest" });
  const presentation = guestVisitPresentation(visit);

  return (
    <section className={styles.summary}>
      <dl className={styles.factList}>
        <dt>{t("stayLabel")}</dt>
        <dd>{formatDateStay(visit.stay, locale)}</dd>
        <dt>{t("guestsLabel")}</dt>
        <dd>
          {t("guestCounts", {
            adults: visit.adults,
            children: visit.children,
            pets: visit.pets,
          })}
        </dd>
        <dt>{t("roomCountLabel")}</dt>
        <dd data-testid="guest-room-count">
          {t("roomCount", { count: visit.roomCount })}
        </dd>
        <dt>{t("assignedRoomsLabel")}</dt>
        <dd data-testid="guest-room-labels">
          {visit.roomLabels.length > 0
            ? visit.roomLabels.join(", ")
            : t("assignedRoomsPending")}
        </dd>
      </dl>

      {visit.hasOverlap ? (
        <p className={styles.sharedNote}>{t("sharedStayNote")}</p>
      ) : null}
      {visit.status === "reconfirm_pending" ? (
        <p className={styles.chase}>
          {visit.chaseMessage ?? t("chaseMessageFallback")}
        </p>
      ) : null}
      {presentation.holdMessageKey ? (
        <p className={styles.holdNotice}>
          {t(presentation.holdMessageKey, {
            expiry: visit.holdExpiresAt
              ? formatHouseholdDateTime(
                  visit.holdExpiresAt,
                  locale,
                  visit.timeZone,
                )
              : t("holdExpiryUnavailable"),
          })}
        </p>
      ) : null}
      {presentation.canChange ? (
        <GuestActions
          canReconfirm={visit.status === "reconfirm_pending"}
          locale={locale}
          reconfirmAction={reconfirmAction}
          requestChangeAction={requestChangeAction}
          token={token}
        />
      ) : null}
    </section>
  );
}
