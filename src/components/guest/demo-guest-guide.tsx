import { getTranslations } from "next-intl/server";

import { DEMO_SEED } from "@/lib/demo/reset";
import styles from "./guest-ledger.module.css";

/** Rendered only after the guest page verifies that the invitation belongs to a synthetic home. */
export async function DemoGuestGuide({
  invitationId,
  locale,
}: {
  invitationId: string;
  locale: "en" | "es";
}) {
  const t = await getTranslations({ locale, namespace: "DemoGuestGuide" });
  const scenario =
    invitationId === DEMO_SEED.parties[0].invitation.id
      ? "vega"
      : invitationId === DEMO_SEED.parties[1].invitation.id
        ? "otero"
        : "generic";
  return (
    <aside
      className={styles.sharedNote}
      data-testid="demo-guest-guide"
      data-scenario={scenario}
      aria-labelledby="demo-guest-guide-title"
    >
      <h2 id="demo-guest-guide-title">{t("title")}</h2>
      <p>{t(scenario)}</p>
      {scenario === "otero" ? <p>{t("access")}</p> : null}
      <p>{t("pending")}</p>
      <p>{t("follow")}</p>
      <a
        href={`/${locale}`}
        data-testid="demo-return-host"
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: "var(--interactive-target, 44px)",
          padding: "0.5rem 0",
        }}
      >
        {t("host")}
      </a>
      <p>{t("shared")}</p>
    </aside>
  );
}
