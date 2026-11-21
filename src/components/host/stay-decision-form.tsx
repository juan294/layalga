"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { decideStay } from "@/app/[locale]/(host)/stay-decision-actions";
import { buttonStyle, quietButtonStyle } from "./host-styles";

type DecisionState = Awaited<ReturnType<typeof decideStay>> | null;

export function StayDecisionForm({
  id,
  version,
  locale,
}: {
  id: string;
  version: number;
  locale: AppLocale;
}) {
  const t = useTranslations("HostStayRequests");
  const receipt = useTranslations("StayRequests");
  const [result, action, pending] = useActionState<DecisionState, FormData>(
    async (_previous, form) => {
      try {
        return await decideStay(id, version, form);
      } catch {
        // The server may have committed before the response was lost.
        return { status: "unavailable" } as const;
      }
    },
    null,
  );
  const canDecide = !result || result.status === "unavailable";
  return (
    <>
      {canDecide && (
        <form action={action}>
          <p>{t("confirmationMeaning")}</p>
          <p>{t("roomCheck")}</p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              style={buttonStyle}
              name="answer"
              value="confirm"
              disabled={pending}
            >
              {t("confirm")}
            </button>
            <button
              style={quietButtonStyle}
              name="answer"
              value="decline"
              disabled={pending}
            >
              {t("decline")}
            </button>
          </div>
        </form>
      )}
      {result && (
        <p role={result.status === "unavailable" ? "alert" : "status"}>
          {t(result.status)}
          {result.status === "conflict" && result.currentStatus && (
            <> {receipt(`status.${result.currentStatus}`)}</>
          )}
          {"actor" in result && result.actor && (
            <> {t("decidedBy", { name: result.actor })}</>
          )}
        </p>
      )}
      {result &&
        (result.status === "stale" ||
          result.status === "sign_in" ||
          result.status === "invalid") && (
          <a href={`/${locale}/review-stay/${id}`}>{t("reopen")}</a>
        )}
    </>
  );
}
