"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  reviewStayRequest,
  sendStayRequest,
} from "@/app/[locale]/requests/actions";
import { SignInButton } from "@/app/[locale]/sign-in/sign-in-button";
import type { AppLocale } from "@/i18n/routing";
import { RequestTerms } from "./request-terms";
import { guestConversationTurn } from "@/app/[locale]/stays/conversation-actions";
import {
  REQUEST_CHAT_DRAFT_STORAGE,
  REQUEST_DRAFT_STORAGE,
} from "./request-storage";
import styles from "./guest-ledger.module.css";

type Review = Awaited<ReturnType<typeof reviewStayRequest>>;
type Sent = Awaited<ReturnType<typeof sendStayRequest>>;

export function RequestReview({
  locale,
  email,
  authFailed,
}: {
  locale: AppLocale;
  email: string | null;
  authFailed: boolean;
}) {
  const t = useTranslations("StayRequests");
  const chat = useTranslations("GuestConversation");
  const router = useRouter();
  const [reviewed, setReviewed] = useState<{
    token: string;
    chat: boolean;
  } | null>(null);
  const [command, setCommand] = useState("");
  const [commandFeedback, setCommandFeedback] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [reply, setReply] = useState<Sent | null>(null);
  const [retry, refresh] = useState(0);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!email) return;
    let active = true;
    async function check() {
      try {
        const token = sessionStorage.getItem(REQUEST_DRAFT_STORAGE);
        const fresh: Review = token
          ? await reviewStayRequest(token)
          : { status: "expired" };
        if (active) {
          setReview(fresh);
          setReviewed(
            token && fresh.status === "ready"
              ? {
                  token,
                  chat:
                    sessionStorage.getItem(REQUEST_CHAT_DRAFT_STORAGE) ===
                    token,
                }
              : null,
          );
          if (fresh.status === "replayed")
            router.replace(`/${locale}/requests/${fresh.requestId}`);
        }
      } catch {
        if (active) setReview({ status: "unavailable" });
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, [retry, email, locale, router]);
  async function submitReviewed(account: string) {
    if (!reviewed) return;
    try {
      const result = await sendStayRequest(reviewed.token, account);
      if (result.status === "pending" || result.status === "replayed")
        router.replace(`/${locale}/requests/${result.requestId}`);
      else if (result.status === "expired") setReview({ status: "expired" });
      else setReply(result);
    } catch {
      setReply({ status: "unavailable" });
    }
  }
  if (
    !email ||
    review?.status === "sign_in" ||
    reply?.status === "sign_in" ||
    reply?.status === "changed_account"
  )
    return (
      <>
        <p role="status">
          {t(
            reply?.status === "changed_account" ? "changed_account" : "sign_in",
          )}
        </p>
        {authFailed && <p role="alert">{t("authFailed")}</p>}
        <SignInButton
          locale={locale}
          nextPath={`/${locale}/requests/review`}
          label={t("signIn")}
          className={styles.primaryButton}
        />
      </>
    );
  if (!review) return <p role="status">{t("loading")}</p>;
  if (review.status === "replayed" || review.status === "conflict")
    return (
      <>
        <p>{t(review.status === "replayed" ? "alreadySent" : "conflict")}</p>
        <Link href={`/${locale}/requests/${review.requestId}`}>
          {t("viewRequest")}
        </Link>
      </>
    );
  if (review.status !== "ready")
    return (
      <>
        <p role="alert">{t(review.status)}</p>
        {review.status === "unavailable" && (
          <button onClick={() => refresh((n) => n + 1)}>{t("retry")}</button>
        )}
        <Link href={`/${locale}/stays`}>{t("findAnother")}</Link>
      </>
    );
  const terminal =
    reply?.status === "stale" ||
    reply?.status === "limit" ||
    reply?.status === "invalid" ||
    reply?.status === "conflict";
  return (
    <>
      <RequestTerms locale={locale} record={review} />
      <p>{t("reviewHelp")}</p>
      {authFailed && <p role="alert">{t("authFailed")}</p>}
      {reply && reply.status !== "pending" && reply.status !== "replayed" && (
        <p role="alert">{t(reply.status)}</p>
      )}
      {reply?.status === "conflict" && (
        <Link href={`/${locale}/requests/${reply.requestId}`}>
          {t("viewRequest")}
        </Link>
      )}
      <p>{t("sendingAs", { email })}</p>
      {!terminal && reviewed?.chat && (
        <form
          method="post"
          className={styles.commandForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (!command.trim() || pending) return;
            start(async () => {
              try {
                const turn = await guestConversationTurn({
                  locale,
                  message: command,
                });
                if (turn.kind === "sign_in") setReply({ status: "sign_in" });
                else if (turn.kind === "submit") await submitReviewed(email);
                else
                  setCommandFeedback(
                    turn.kind === "unavailable"
                      ? chat("unavailable")
                      : chat("otherCommand"),
                  );
              } catch {
                setCommandFeedback(chat("unavailable"));
              }
            });
          }}
        >
          <label className={styles.field}>
            {chat("commandHint")}
            <input
              maxLength={600}
              required
              autoComplete="off"
              value={command}
              placeholder={chat("submitExample")}
              onChange={(e) => setCommand(e.target.value)}
            />
          </label>
          <button
            disabled={pending || !command.trim()}
            className={styles.secondaryButton}
          >
            {chat("command")}
          </button>
          {commandFeedback && <p role="alert">{commandFeedback}</p>}
        </form>
      )}
      {!terminal && (
        <button
          type="button"
          disabled={pending}
          className={styles.primaryButton}
          onClick={() => start(() => submitReviewed(email))}
        >
          {pending ? t("sending") : t("send")}
        </button>
      )}
      <p className={styles.reviewNavigation}>
        <Link href={`/${locale}/stays/${review.handle}`}>
          {t("findAnother")}
        </Link>
      </p>
    </>
  );
}
