"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  findGuestOptions,
  submitGuestVisit,
  type GuestOptionState,
  type GuestSearchCriteria,
  type GuestSubmitState,
} from "@/app/[locale]/g/[token]/actions";

import styles from "./guest-ledger.module.css";
import { Field } from "./field";
import { GuestWebMcpRegistration } from "@/components/webmcp/guest-registration";

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
  const [criteria, setCriteria] = useState<GuestSearchCriteria>({
    from: defaults.from,
    to: defaults.to,
    nights: defaults.nights,
    adults: defaults.adults,
    children: defaults.children,
    pets: defaults.pets,
  });
  const searchDirty =
    optionState.status === "success" &&
    Boolean(
      optionState.criteria &&
      guestSearchIsStale(optionState.criteria, criteria),
    );
  const optionsVisible =
    optionState.status === "success" && !searchDirty && !finding;
  const optionsHeadingRef = useRef<HTMLHeadingElement>(null);
  const optionsWereVisible = useRef(optionsVisible);
  const changeText =
    (field: "from" | "to") => (event: React.ChangeEvent<HTMLInputElement>) =>
      setCriteria((current) => ({ ...current, [field]: event.target.value }));
  const changeCount =
    (field: "nights" | "adults" | "children" | "pets") =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setCriteria((current) => ({
        ...current,
        [field]: Number(event.target.value),
      }));

  useEffect(() => {
    if (shouldFocusGuestOptions(optionsWereVisible.current, optionsVisible)) {
      optionsHeadingRef.current?.focus();
    }
    optionsWereVisible.current = optionsVisible;
  }, [optionsVisible]);

  return (
    <div className={styles.formStack}>
      <GuestWebMcpRegistration
        options={optionsVisible ? optionState.options : []}
      />
      <form
        action={findAction}
        className={styles.ruledForm}
        data-webmcp-guest-search
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
              value={criteria.from}
              name="from"
              onChange={changeText("from")}
              required
              type="date"
            />
          </Field>
          <Field label={t("windowTo")} name="to">
            <input
              value={criteria.to}
              name="to"
              onChange={changeText("to")}
              required
              type="date"
            />
          </Field>
          <Field label={t("nights")} name="nights">
            <input
              value={criteria.nights}
              max={30}
              min={1}
              name="nights"
              onChange={changeCount("nights")}
              required
              type="number"
            />
          </Field>
          <Field label={t("adults")} name="search-adults">
            <input
              min={1}
              name="adults"
              onChange={changeCount("adults")}
              required
              type="number"
              value={criteria.adults}
            />
          </Field>
          <Field label={t("children")} name="search-children">
            <input
              min={0}
              name="children"
              onChange={changeCount("children")}
              required
              type="number"
              value={criteria.children}
            />
          </Field>
          <Field label={t("pets")} name="search-pets">
            <input
              min={0}
              name="pets"
              onChange={changeCount("pets")}
              required
              type="number"
              value={criteria.pets}
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

      {optionsVisible && optionState.status === "success" ? (
        <GuestRoomReview
          defaults={defaults}
          headingRef={optionsHeadingRef}
          key={guestRoomReviewKey(optionState.criteria!, optionState.options)}
          locale={locale}
          options={optionState.options}
          search={optionState.criteria!}
          submitAction={submitAction}
          submitState={submitState}
          submitting={submitting}
          token={token}
        />
      ) : null}
    </div>
  );
}

interface GuestRoomReviewProps {
  token: string;
  locale: "en" | "es";
  defaults: GuestInviteFormProps["defaults"];
  options: NonNullable<GuestOptionState["options"]>;
  search: GuestSearchCriteria;
  submitState: GuestSubmitState;
  submitAction: (payload: FormData) => void;
  submitting: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

function GuestRoomReview({
  token,
  locale,
  defaults,
  options,
  search,
  submitState,
  submitAction,
  submitting,
  headingRef,
}: GuestRoomReviewProps) {
  const t = useTranslations("Guest");
  const firstStay = options[0]?.stay.join("|") ?? "";
  const [selectedStay, setSelectedStay] = useState(firstStay);
  const [selectedByStay, setSelectedByStay] = useState<
    Record<string, string[]>
  >(() =>
    Object.fromEntries(
      options.map((option) => [
        option.stay.join("|"),
        [...option.recommendedRoomIds],
      ]),
    ),
  );
  const selectedOption =
    options.find((option) => option.stay.join("|") === selectedStay) ??
    options[0];
  const selectedIds = selectedByStay[selectedStay] ?? [];
  const selectedRooms =
    selectedOption?.rooms.filter((room) => selectedIds.includes(room.id)) ?? [];
  const partySize = search.adults + search.children;
  const standardCapacity = selectedRooms.reduce(
    (total, room) => total + room.standardCapacity,
    0,
  );
  const maximumCapacity = selectedRooms.reduce(
    (total, room) => total + room.maximumCapacity,
    0,
  );
  const needsOverflow =
    standardCapacity < partySize && maximumCapacity >= partySize;
  const selectionCanSubmit = guestSelectionCanSubmit(
    selectedIds.length,
    maximumCapacity,
    partySize,
  );

  const toggleRoom = (roomId: string) => {
    setSelectedByStay((current) => {
      const selected = current[selectedStay] ?? [];
      return {
        ...current,
        [selectedStay]: selected.includes(roomId)
          ? selected.filter((id) => id !== roomId)
          : [...selected, roomId],
      };
    });
  };

  return (
    <form
      action={submitAction}
      className={styles.ruledForm}
      data-webmcp-guest-options
      data-testid="guest-submit-form"
    >
      <input name="token" type="hidden" value={token} />
      <input name="locale" type="hidden" value={locale} />
      <input name="stay" type="hidden" value={selectedStay} />
      <input name="adults" type="hidden" value={search.adults} />
      <input name="children" type="hidden" value={search.children} />
      <input name="pets" type="hidden" value={search.pets} />
      <div className={styles.formHeading}>
        <span className={styles.sequence}>{t("stepRooms")}</span>
        <h2 ref={headingRef} tabIndex={-1}>
          {t("chooseRoomsTitle")}
        </h2>
      </div>
      <fieldset className={styles.optionList}>
        <legend>{t("chooseStay")}</legend>
        {options.map((option) => {
          const value = option.stay.join("|");
          return (
            <label className={styles.option} key={value}>
              <input
                checked={selectedStay === value}
                data-testid="guest-option"
                name="stay-choice"
                onChange={() => setSelectedStay(value)}
                type="radio"
                value={value}
              />
              <span>
                <strong>{formatStay(option.stay, locale)}</strong>
                <small>
                  {t("roomsAvailable", { count: option.rooms.length })}
                  {option.hasOverlap ? ` · ${t("sharedHomeNote")}` : ""}
                </small>
              </span>
            </label>
          );
        })}
      </fieldset>

      {selectedOption ? (
        <fieldset className={styles.roomList}>
          <legend>{t("chooseExactRooms")}</legend>
          {selectedOption.rooms.map((room) => {
            const recommended = selectedOption.recommendedRoomIds.includes(
              room.id,
            );
            return (
              <label className={styles.roomOption} key={room.id}>
                <input
                  checked={selectedIds.includes(room.id)}
                  data-testid="guest-room-option"
                  name="roomIds"
                  onChange={() => toggleRoom(room.id)}
                  type="checkbox"
                  value={room.id}
                />
                <span>
                  <strong>{room.guestLabel}</strong>
                  <small>
                    {room.floorLabel} · {room.sleepingArrangement}
                  </small>
                  <small>
                    {t("roomCapacity", {
                      standard: room.standardCapacity,
                      maximum: room.maximumCapacity,
                    })}
                    {recommended ? ` · ${t("recommendedRoom")}` : ""}
                  </small>
                  {room.overflowArrangement ? (
                    <small>
                      {t("overflowArrangement", {
                        arrangement: room.overflowArrangement,
                      })}
                    </small>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : null}

      <p className={styles.capacityNote} role="status">
        {t("selectedCapacity", {
          standard: standardCapacity,
          maximum: maximumCapacity,
          guests: partySize,
        })}
      </p>
      {selectedIds.length > 0 && maximumCapacity < partySize ? (
        <p className={styles.notice} role="alert">
          {t("selectedRoomsTooSmall")}
        </p>
      ) : null}
      {needsOverflow ? (
        <label className={styles.consent}>
          <input name="overflowConsent" required type="checkbox" />
          <span>{t("overflowConsent")}</span>
        </label>
      ) : null}

      <div className={styles.formHeading}>
        <span className={styles.sequence}>{t("stepDetails")}</span>
        <h2>{t("reviewStayTitle")}</h2>
      </div>
      <div className={styles.fieldGrid}>
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
        disabled={submitting || !selectionCanSubmit}
        type="submit"
      >
        {submitting ? t("submitting") : t("submitStay")}
      </button>
    </form>
  );
}

export function guestSearchIsStale(
  searched: GuestSearchCriteria,
  current: GuestSearchCriteria,
): boolean {
  return (
    searched.from !== current.from ||
    searched.to !== current.to ||
    searched.nights !== current.nights ||
    searched.adults !== current.adults ||
    searched.children !== current.children ||
    searched.pets !== current.pets
  );
}

export function guestRoomReviewKey(
  criteria: GuestSearchCriteria,
  options: GuestOptionState["options"],
): string {
  return JSON.stringify([
    criteria,
    options.map((option) => [option.stay, option.recommendedRoomIds]),
  ]);
}

export function guestSelectionCanSubmit(
  selectedRoomCount: number,
  maximumCapacity: number,
  partySize: number,
): boolean {
  return selectedRoomCount > 0 && maximumCapacity >= partySize;
}

export function shouldFocusGuestOptions(
  wasVisible: boolean,
  isVisible: boolean,
): boolean {
  return !wasVisible && isVisible;
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
