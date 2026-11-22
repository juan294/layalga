"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { staySignInPath } from "@/lib/auth/stay-sign-in-path";
import { useRouter } from "next/navigation";
import { prepareStayRequest } from "@/app/[locale]/requests/actions";
import type { PublicStayOption } from "@/core/booking/public-stay-search";
import type { GuestSearchCriteria } from "@/core/booking/stay-options";
import type { AppLocale } from "@/i18n/routing";
import {
  MAX_GUEST_NOTES_LENGTH,
  MAX_SPECIAL_REQUEST_LENGTH,
} from "@/agent/task-limits";
import {
  REQUEST_CHAT_DRAFT_STORAGE,
  REQUEST_DRAFT_STORAGE,
} from "./request-storage";
import styles from "./guest-ledger.module.css";

export function StaySelectionForm({
  locale,
  handle,
  criteria,
  option,
  conversation = false,
}: {
  locale: AppLocale;
  handle: string;
  criteria: GuestSearchCriteria;
  option: PublicStayOption;
  conversation?: boolean;
}) {
  const t = useTranslations("StayRequests");
  const stays = useTranslations("PublicStays");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<
    "invalid" | "stale" | "unavailable" | null
  >(null);
  return (
    <form
      data-webmcp-public-option={
        conversation ? undefined : option.stay.join("|")
      }
      method="post"
      className={styles.formStack}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        start(async () => {
          try {
            const result = await prepareStayRequest({
              handle,
              criteria,
              locale,
              roomRefs: data.getAll("room"),
              overflowConsent: data.get("overflow") === "on",
              notes: data.get("notes"),
              requests: data.get("requests"),
              idempotencyKey: crypto.randomUUID(),
            });
            if (result.status === "sign_in") {
              router.replace(staySignInPath(locale, handle, { ...criteria }));
              return;
            }
            if (result.status !== "ready") {
              setError(result.status);
              return;
            }
            sessionStorage.setItem(REQUEST_DRAFT_STORAGE, result.token);
            if (conversation)
              sessionStorage.setItem(REQUEST_CHAT_DRAFT_STORAGE, result.token);
            else sessionStorage.removeItem(REQUEST_CHAT_DRAFT_STORAGE);
            router.push(`/${locale}/requests/review`);
          } catch {
            setError("unavailable");
          }
        });
      }}
    >
      <fieldset className={styles.formStack}>
        <legend>{t("chooseRooms")}</legend>
        <ul className={styles.accountVisits}>
          {option.rooms.map((room) => (
            <li key={room.ref}>
              <label>
                <input
                  type="checkbox"
                  name="room"
                  value={room.ref}
                  defaultChecked={option.recommendedRoomRefs.includes(room.ref)}
                />{" "}
                <strong>{room.guestLabel}</strong>
              </label>
              <span>
                {[room.floorLabel, room.sleepingArrangement]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <small>{stays("sleeps", { count: room.standardCapacity })}</small>
              {room.maximumCapacity > room.standardCapacity &&
                room.overflowArrangement && (
                  <small>
                    {stays("overflow", {
                      count: room.maximumCapacity,
                      arrangement: room.overflowArrangement,
                    })}
                  </small>
                )}
              {option.recommendedRoomRefs.includes(room.ref) && (
                <small>{stays("recommended")}</small>
              )}
            </li>
          ))}
        </ul>
      </fieldset>
      {option.rooms.some(
        (room) =>
          room.overflowArrangement &&
          room.maximumCapacity > room.standardCapacity,
      ) && (
        <label>
          <input type="checkbox" name="overflow" /> {t("overflowConsent")}
        </label>
      )}
      <label className={styles.field}>
        {t("notes")}
        <textarea name="notes" maxLength={MAX_GUEST_NOTES_LENGTH} />
      </label>
      <label className={styles.field}>
        {t("requests")}
        <textarea name="requests" maxLength={MAX_SPECIAL_REQUEST_LENGTH} />
      </label>
      <button disabled={pending} className={styles.primaryButton}>
        {t("review")}
      </button>
      {error && <p role="alert">{t(error)}</p>}
    </form>
  );
}
