"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { AppLocale } from "@/i18n/routing";
import type {
  GuestConversationReply,
  GuestConversationState,
} from "@/core/booking/guest-conversation-contract";
import { guestConversationTurn } from "@/app/[locale]/stays/conversation-actions";
import { formatDateStay } from "../frontend-utils";
import { useHydrated } from "../use-hydrated";
import { StaySelectionForm } from "./stay-selection-form";
import { staySignInPath } from "@/lib/auth/stay-sign-in-path";
import { structuredStayPath } from "./structured-stay-path";
import ledger from "./guest-ledger.module.css";
import styles from "./guest-conversation.module.css";

type Exchange = { question: string; answer: string };
export function GuestConversation({
  locale,
  handle,
  displayName,
}: {
  locale: AppLocale;
  handle?: string;
  displayName?: string;
}) {
  const t = useTranslations("GuestConversation");
  const requests = useTranslations("StayRequests");
  const account = useTranslations("GuestAccount");
  const [state, setState] = useState<GuestConversationState>(
    handle ? { handle } : {},
  );
  const hydrated = useHydrated();
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Exchange[]>([]);
  const [reply, setReply] = useState<GuestConversationReply | null>(null);
  const [offered, setOffered] = useState<GuestConversationReply | null>(null);
  const [selection, setSelection] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [reconnect, setReconnect] = useState<{
    href: string;
    message: string;
  } | null>(null);
  const structured = structuredStayPath(locale, {
    ...state,
    ...(reply?.criteria ?? offered?.criteria),
  });
  function turn(
    text: string,
    nextState: GuestConversationState = state,
    label = text,
  ) {
    if (pending) return;
    start(async () => {
      try {
        const next = await guestConversationTurn({
          locale,
          message: text,
          state: nextState,
        });
        if (next.kind === "sign_in") {
          const returnHandle = nextState.handle ?? handle;
          setReconnect({
            href: staySignInPath(locale, returnHandle, {
              ...nextState,
              ...(offered?.state.handle === returnHandle
                ? offered?.criteria
                : undefined),
            }),
            message: next.message,
          });
          setMessage("");
          setTurns([]);
          setState({});
          setReply(null);
          setOffered(null);
          setSelection(null);
          return;
        }
        setState(next.state);
        setReply(next);
        let answer = next.message;
        if (next.kind === "options") {
          setOffered(next);
          setSelection(null);
        } else if (next.kind === "review") {
          const index = next.selectedIndex;
          if (
            index !== undefined &&
            index >= 0 &&
            offered?.options?.[index] &&
            offered.state.handle === next.state.handle
          ) {
            setSelection(index);
          } else {
            setSelection(null);
            answer = t("chooseFirst");
          }
        } else if (next.kind === "submit") {
          answer = t("chooseFirst");
        } else if (next.kind !== "unavailable") {
          setOffered(null);
          setSelection(null);
        }
        setTurns((old) => [...old, { question: label, answer }].slice(-8));
        if (next.kind !== "unavailable") setMessage("");
      } catch {
        setTurns((old) =>
          [...old, { question: label, answer: t("unavailable") }].slice(-8),
        );
      }
    });
  }
  if (reconnect)
    return (
      <section className={styles.panel} aria-label={t("title")}>
        <p role="status">{reconnect.message}</p>
        <Link href={reconnect.href}>{t("signInStatus")}</Link>
      </section>
    );
  const option = selection === null ? null : offered?.options?.[selection];
  const criteria = offered?.criteria;
  const earlier = turns.map((exchange, i) => (
    <div className={styles.exchange} key={i}>
      <p className={styles.question}>
        <span className={styles.sr}>{t("you")} </span>
        {exchange.question}
      </p>
      <p className={styles.answer}>
        <span className={styles.sr}>L’Ayalga </span>
        {exchange.answer}
      </p>
    </div>
  ));
  const latest = earlier.pop();
  return (
    <section className={styles.panel} aria-label={t("title")}>
      <h2 className={styles.heading}>{t("title")}</h2>
      {!turns.length && (
        <p className={styles.intro}>
          {displayName ? t("welcomeHome", { name: displayName }) : t("welcome")}
        </p>
      )}
      {!!turns.length && (
        <div className={styles.log} role="log" aria-label={t("conversation")}>
          {earlier.length > 0 && (
            <details className={styles.history}>
              <summary>{t("earlier")}</summary>
              {earlier}
            </details>
          )}
          {latest}
        </div>
      )}
      {reply?.kind === "listings" && !!reply.listings?.length && (
        <ul className={styles.choices}>
          {reply.listings.map((h) => (
            <li key={h.handle}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  turn("", { ...state, handle: h.handle }, h.displayName)
                }
              >
                {h.displayName}
                {reply.listings!.some(
                  (other) =>
                    other.handle !== h.handle &&
                    other.displayName === h.displayName,
                ) && <small> · {h.handle}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {offered?.options?.length && selection === null ? (
        <ol className={styles.options} aria-label={t("options")}>
          {offered.options.map((o, i) => {
            const rooms = o.rooms.filter((room) =>
              o.recommendedRoomRefs.includes(room.ref),
            );
            const standard = rooms.reduce(
              (total, room) => total + room.standardCapacity,
              0,
            );
            const overflow =
              criteria && standard < criteria.adults + criteria.children;
            return (
              <li key={o.stay[0]}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setSelection(i);
                    setMessage("");
                  }}
                >
                  <strong>
                    {t("option", { n: i + 1 })} ·{" "}
                    {formatDateStay(o.stay, locale)}
                  </strong>
                  {rooms.map((room) => (
                    <span key={room.ref}>
                      {[
                        room.guestLabel,
                        room.floorLabel,
                        room.sleepingArrangement,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {overflow &&
                        room.maximumCapacity > room.standardCapacity &&
                        room.overflowArrangement && (
                          <>
                            {" "}
                            ·{" "}
                            {t("extraBedding", {
                              terms: room.overflowArrangement,
                            })}
                          </>
                        )}
                    </span>
                  ))}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
      {option && criteria && offered?.state.handle && (
        <div className={styles.selection}>
          <h3>{formatDateStay(option.stay, locale)}</h3>
          <p>
            {requests("party", {
              adults: criteria.adults,
              children: criteria.children,
              pets: criteria.pets,
            })}
          </p>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setSelection(null)}
          >
            {t("compare")}
          </button>
          <StaySelectionForm
            key={option.stay[0]}
            locale={locale}
            handle={offered.state.handle}
            criteria={{ ...criteria, from: option.stay[0], to: option.stay[1] }}
            option={option}
            conversation
          />
        </div>
      )}
      {reply?.kind === "status" && !!reply.receipts?.length && (
        <ul className={styles.receipts}>
          {reply.receipts.map((r) => (
            <li key={r.id}>
              <Link href={`/${locale}/requests/${r.id}`}>
                {r.displayName ?? requests("receipt")}
                {r.stay && <> · {formatDateStay(r.stay, locale)}</>}
              </Link>
              <strong>
                {r.visitStatus
                  ? account(`status.${r.visitStatus}`)
                  : requests(`status.${r.status}`)}
              </strong>
            </li>
          ))}
        </ul>
      )}
      <form
        method="post"
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          if (message.trim()) turn(message.trim());
        }}
      >
        <label htmlFor="guest-conversation-message">{t("message")}</label>
        <div>
          <input
            id="guest-conversation-message"
            autoComplete="off"
            placeholder={t(handle ? "exampleHome" : "example")}
            maxLength={600}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            // Text typed before hydration never reaches state, so Ask would stay disabled.
            disabled={!hydrated}
            required
          />
          <button
            className={ledger.primaryButton}
            disabled={pending || !message.trim()}
          >
            {pending ? t("checking") : t("ask")}
          </button>
        </div>
      </form>
      <div className={styles.links}>
        <a href={structured}>{t("structured")}</a>
      </div>
    </section>
  );
}
