"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { disconnect } from "@/app/[locale]/assistants/actions";

import { GuestActionButton } from "./guest-action-button";
import styles from "./guest-ledger.module.css";

export interface ConnectionRow {
  clientId: string;
  name: string;
  recognized: boolean;
  connectedOn: string;
}

export function ConnectedAssistants({
  connections,
}: {
  connections: ConnectionRow[];
}) {
  const t = useTranslations("Assistants");
  const [result, action] = useActionState(disconnect, null);
  return (
    <div>
      {result?.status === "disconnected" && (
        <p role="status">{t("list.disconnected")}</p>
      )}
      {(result?.status === "failed" || result?.status === "gone") && (
        <p role="alert">{t(`list.${result.status}`)}</p>
      )}
      {connections.length === 0 && <p>{t("list.empty")}</p>}
      {connections.length > 0 && (
        <ul className={styles.connections}>
          {connections.map(({ clientId, name, recognized, connectedOn }) => (
            <li key={clientId}>
              <div>
                <strong>{name}</strong>
                {!recognized && ` (${t("list.unrecognized")})`}
                <small>{t("list.connectedOn", { date: connectedOn })}</small>
              </div>
              <form action={action}>
                <input type="hidden" name="clientId" value={clientId} />
                <GuestActionButton
                  ariaLabel={t("list.disconnectNamed", {
                    assistant: recognized
                      ? name
                      : `${name} (${t("list.unrecognized")})`,
                  })}
                  className={styles.secondaryButton}
                  label={t("list.disconnect")}
                  pendingLabel={t("list.disconnecting")}
                  testId="assistant-disconnect"
                />
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
