"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { disconnect } from "@/app/[locale]/assistants/actions";
import type { AppLocale } from "@/i18n/routing";

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
  const message = useRef<HTMLParagraphElement>(null);
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    // The server does not know the viewer's zone.
    timeZone: hydrated ? undefined : "UTC",
  });

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
          assistant: result.name,
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
                      {date.format(new Date(connectedAt))}
                    </time>
                  </small>
                </div>
                <form action={action}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <input type="hidden" name="name" value={label} />
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
