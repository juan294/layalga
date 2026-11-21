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
import { REQUEST_DRAFT_STORAGE } from "./request-storage";
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
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(null);
  const [reply, setReply] = useState<Sent | null>(null);
  const [retry, refresh] = useState(0);
  const [pending, start] = useTransition();
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const token = sessionStorage.getItem(REQUEST_DRAFT_STORAGE);
        const fresh: Review = token
          ? await reviewStayRequest(token)
          : { status: "expired" };
        if (active) {
          setReview(fresh);
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
  }, [retry, locale, router]);
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
  const needSignIn =
    !email ||
    reply?.status === "sign_in" ||
    reply?.status === "changed_account";
  const terminal =
    reply?.status === "stale" ||
    reply?.status === "expired" ||
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
      {needSignIn ? (
        <SignInButton
          locale={locale}
          nextPath={`/${locale}/requests/review`}
          label={t("signIn")}
          className={styles.primaryButton}
        />
      ) : (
        <>
          <p>{t("sendingAs", { email })}</p>
          {!terminal && (
            <button
              type="button"
              disabled={pending}
              className={styles.primaryButton}
              onClick={() =>
                start(async () => {
                  try {
                    const token = sessionStorage.getItem(REQUEST_DRAFT_STORAGE);
                    if (!token) {
                      setReply({ status: "expired" });
                      return;
                    }
                    const result = await sendStayRequest(token, email);
                    if (
                      result.status === "pending" ||
                      result.status === "replayed"
                    ) {
                      // Keep the sealed key across a lost response or failed navigation.
                      router.replace(`/${locale}/requests/${result.requestId}`);
                    } else setReply(result);
                  } catch {
                    setReply({ status: "unavailable" });
                  }
                })
              }
            >
              {pending ? t("sending") : t("send")}
            </button>
          )}
        </>
      )}
      <Link href={`/${locale}/stays/${review.handle}`}>{t("findAnother")}</Link>
    </>
  );
}
