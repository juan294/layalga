"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  findGuestOptions,
  submitGuestVisit,
  type GuestOptionState,
  type GuestSubmitState,
} from "@/app/[locale]/g/[token]/actions";

import styles from "./guest-ledger.module.css";
import { Field } from "./field";

const initialOptionState: GuestOptionState = {
  status: "idle",
  options: [],
};
const initialSubmitState: GuestSubmitState = { status: "idle" };

interface GuestInviteFormProps {
  token: string;
  locale: "en" | "es";
  defaults: {
    from: string;
    to: string;
    nights: number;
    adults: number;
    children: number;
    pets: number;
    notes: string;
  };
}

export function GuestInviteForm({
  token,
  locale,
  defaults,
}: GuestInviteFormProps) {
  const t = useTranslations("Guest");
  const [optionState, findAction, finding] = useActionState(
    findGuestOptions,
    initialOptionState,
  );
  const [submitState, submitAction, submitting] = useActionState(
    submitGuestVisit,
    initialSubmitState,
  );
  const [searchDirty, setSearchDirty] = useState(false);
  const markSearchDirty = () => {
    if (optionState.status === "success") setSearchDirty(true);
  };

  return (
    <div className={styles.formStack}>
      <form
        action={findAction}
        className={styles.ruledForm}
        onSubmit={() => setSearchDirty(false)}
      >
        <input name="token" type="hidden" value={token} />
        <input name="locale" type="hidden" value={locale} />
        <div className={styles.formHeading}>
          <span className={styles.sequence}>{t("stepDates")}</span>
          <h2>{t("findDatesTitle")}</h2>
        </div>
        <div className={styles.fieldGrid}>
          <Field label={t("windowFrom")} name="from">
            <input
              defaultValue={defaults.from}
              name="from"
              onChange={markSearchDirty}
              required
              type="date"
            />
          </Field>
          <Field label={t("windowTo")} name="to">
            <input
              defaultValue={defaults.to}
              name="to"
              onChange={markSearchDirty}
              required
              type="date"
            />
          </Field>
          <Field label={t("nights")} name="nights">
            <input
              defaultValue={defaults.nights}
              max={30}
              min={1}
              name="nights"
              onChange={markSearchDirty}
              required
              type="number"
            />
          </Field>
        </div>
        <button
          className={styles.primaryButton}
          data-testid="find-options"
          disabled={finding}
          type="submit"
        >
          {finding ? t("findingOptions") : t("findOptions")}
        </button>
      </form>

      {optionState.status === "error" ? (
        <p className={styles.notice} role="alert">
          {t(
            optionState.error === "none"
              ? "noOptions"
              : optionState.error === "not_found"
                ? "invalidLinkBody"
                : "optionsError",
          )}
        </p>
      ) : null}

      {searchDirty ? (
        <p className={styles.notice} role="status">
          {t("optionsStale")}
        </p>
      ) : null}

      {optionState.status === "success" && !searchDirty && !finding ? (
        <form
          action={submitAction}
          className={styles.ruledForm}
          data-testid="guest-submit-form"
        >
          <input name="token" type="hidden" value={token} />
          <input name="locale" type="hidden" value={locale} />
          <div className={styles.formHeading}>
            <span className={styles.sequence}>{t("stepDetails")}</span>
            <h2>{t("partyDetailsTitle")}</h2>
          </div>
          <fieldset className={styles.optionList}>
            <legend>{t("chooseStay")}</legend>
            {optionState.options.map((option, index) => (
              <label className={styles.option} key={option.stay.join("-")}>
                <input
                  data-testid="guest-option"
                  defaultChecked={index === 0}
                  name="stay"
                  required
                  type="radio"
                  value={option.stay.join("|")}
                />
                <span>
                  <strong>{formatStay(option.stay, locale)}</strong>
                  <small>
                    {t("roomsAvailable", { count: option.roomCount })}
                    {option.hasOverlap ? ` · ${t("sharedHomeNote")}` : ""}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className={styles.fieldGrid}>
            <Field label={t("adults")} name="adults">
              <input
                defaultValue={defaults.adults}
                min={1}
                name="adults"
                required
                type="number"
              />
            </Field>
            <Field label={t("children")} name="children">
              <input
                defaultValue={defaults.children}
                min={0}
                name="children"
                required
                type="number"
              />
            </Field>
            <Field label={t("pets")} name="pets">
              <input
                defaultValue={defaults.pets}
                min={0}
                name="pets"
                required
                type="number"
              />
            </Field>
            <Field label={t("arrivalTime")} name="arrivalTime">
              <input name="arrivalTime" type="time" />
            </Field>
          </div>
          <Field label={t("notes")} name="notes">
            <textarea defaultValue={defaults.notes} name="notes" rows={3} />
          </Field>
          {submitState.status === "error" ? (
            <p className={styles.notice} role="alert">
              {t(
                submitState.error === "not_found"
                  ? "invalidLinkBody"
                  : submitState.error === "invalid"
                    ? "submitInvalid"
                    : "submitFailed",
              )}
            </p>
          ) : null}
          <button
            className={styles.primaryButton}
            data-testid="guest-submit"
            disabled={submitting}
            type="submit"
          >
            {submitting ? t("submitting") : t("submitStay")}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function formatStay(stay: readonly [string, string], locale: string): string {
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `${format.format(new Date(`${stay[0]}T00:00:00Z`))} – ${format.format(
    new Date(`${stay[1]}T00:00:00Z`),
  )}`;
}
