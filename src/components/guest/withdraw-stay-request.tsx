"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { withdrawMyRequest } from "@/app/[locale]/requests/actions";
import styles from "./guest-ledger.module.css";

export function WithdrawStayRequest({ id }: { id: string }) {
  const t = useTranslations("StayRequests");
  const router = useRouter();
  const [error, setError] = useState<"sign_in" | "unavailable" | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className={styles.secondaryButton}
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const state = await withdrawMyRequest(id);
              if (state === "unavailable" || state === "sign_in")
                setError(state);
              router.refresh();
            } catch {
              setError("unavailable");
            }
          })
        }
      >
        {t("withdraw")}
      </button>
      {error && <p role="alert">{t(error)}</p>}
    </>
  );
}
