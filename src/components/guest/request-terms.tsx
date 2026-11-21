import { useTranslations } from "next-intl";
import type { PublicRoomChoice } from "@/core/booking/public-stay-search";
import { formatDateStay } from "@/components/frontend-utils";
import type { AppLocale } from "@/i18n/routing";
import styles from "./guest-ledger.module.css";

export function RequestTerms({
  locale,
  record,
}: {
  locale: AppLocale;
  record: {
    displayName: string;
    stay: readonly [string, string];
    adults: number;
    children: number;
    pets: number;
    rooms: PublicRoomChoice[];
    overflowConsent: boolean;
    notes: string;
    requests: string;
  };
}) {
  const t = useTranslations("StayRequests");
  return (
    <section aria-label={t("terms")}>
      <h2>{record.displayName}</h2>
      <p>{formatDateStay(record.stay, locale)}</p>
      <p>
        {t("party", {
          adults: record.adults,
          children: record.children,
          pets: record.pets,
        })}
      </p>
      <ul className={styles.accountVisits}>
        {record.rooms.map((room) => (
          <li key={room.ref}>
            <strong>{room.guestLabel}</strong>
            <span>
              {[room.floorLabel, room.sleepingArrangement]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {record.overflowConsent && room.overflowArrangement && (
              <span>{room.overflowArrangement}</span>
            )}
          </li>
        ))}
      </ul>
      {record.overflowConsent && <p>{t("overflowAccepted")}</p>}
      {record.notes && (
        <p>
          <strong>{t("notes")}</strong>
          <br />
          {record.notes}
        </p>
      )}
      {record.requests && (
        <p>
          <strong>{t("requests")}</strong>
          <br />
          {record.requests}
        </p>
      )}
    </section>
  );
}
