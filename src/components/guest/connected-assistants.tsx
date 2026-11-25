"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { disconnect } from "@/app/[locale]/assistants/actions";
import type { AppLocale } from "@/i18n/routing";

import { formatHouseholdDate } from "../frontend-utils";
import { useHydrated } from "../use-hydrated";
import { GuestActionButton } from "./guest-action-button";
import styles from "./assistants.module.css";
import ledger from "./guest-ledger.module.css";

interface ConnectionRow {
  clientId: string;
  name: string;
  recognized: boolean;
  connectedAt: string;
}

export function ConnectedAssistants({
  locale,
  connections,
}: {
  locale: AppLocale;
  connections: ConnectionRow[];
}) {
  const t = useTranslations("Assistants");
  const hydrated = useHydrated();
  const [result, action] = useActionState(disconnect, null);
  const [target, setTarget] = useState("");
  const message = useRef<HTMLParagraphElement>(null);
  // The server does not know the viewer's zone.
  const timeZone = hydrated ? undefined : "UTC";

  // The focused button can be gone with its row.
  useEffect(() => {
    if (result) message.current?.focus();
  }, [result]);

  function resultText() {
    switch (result?.status) {
      case "disconnected":
      case "failed":
      case "unconfirmed":
      case "gone":
        return t(`list.${result.status}`, {
          assistant: target || t("assistant"),
        });
      // The page itself says why there is no list.
      default:
        return null;
    }
  }

  return (
    <div>
      <p className={styles.result} ref={message} role="status" tabIndex={-1}>
        {resultText()}
      </p>
      {connections.length === 0 && (
        <p className={styles.line}>{t("list.empty")}</p>
      )}
      {connections.length > 0 && (
        <ul className={styles.connections}>
          {connections.map(({ clientId, name, recognized, connectedAt }) => {
            const suffix = recognized ? "" : ` (${t("list.unrecognized")})`;
            const label = name + suffix;
            return (
              <li key={clientId}>
                <div>
                  <strong>{name}</strong>
                  {suffix}
                  <small>
                    {t("list.connectedOn")}{" "}
                    <time dateTime={connectedAt}>
                      {formatHouseholdDate(connectedAt, locale, timeZone)}
                    </time>
                  </small>
                </div>
                <form action={action} onSubmit={() => setTarget(label)}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <GuestActionButton
                    ariaLabel={t("list.disconnectNamed", { assistant: label })}
                    className={ledger.secondaryButton}
                    label={t("list.disconnect")}
                    pendingLabel={t("list.disconnecting")}
                    testId="assistant-disconnect"
                  />
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
