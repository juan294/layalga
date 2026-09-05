import { getTranslations } from "next-intl/server";

import { DEMO_SEED } from "@/lib/demo/reset";
import { GuidedDemoStart } from "./guided-demo-start";
import {
  graphite,
  headingStyle,
  labelStyle,
  panelStyle,
  quietButtonStyle,
} from "./host-styles";

/** The caller resolves a signed synthetic host before rendering this panel. */
export async function GuidedDemoPanel({
  homeId,
  locale,
}: {
  homeId: string;
  locale: "en" | "es";
}) {
  if (homeId !== DEMO_SEED.home.id) return null;
  const t = await getTranslations({ locale, namespace: "GuidedDemo" });
  return (
    <section
      style={panelStyle}
      data-testid="guided-demo-panel"
      aria-labelledby="guided-demo-title"
    >
      <p style={labelStyle}>{t("synthetic")}</p>
      <h2 id="guided-demo-title" style={headingStyle}>
        {t("title")}
      </h2>
      <p>{t("intro")}</p>
      <p id="guided-demo-shared-reset" style={{ color: graphite }}>
        {t("sharedReset")}
      </p>
      <GuidedDemoStart
        homeId={homeId}
        locale={locale}
        invitations={{
          vega: DEMO_SEED.parties[0].invitation.id,
          otero: DEMO_SEED.parties[1].invitation.id,
        }}
      />
      <h3>{t("followTitle")}</h3>
      <p>{t("followBody")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        <a
          href={`/${locale}/guest`}
          style={{
            ...quietButtonStyle,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {t("returnGuest")}
        </a>
        <a
          href={`/${locale}/sign-in`}
          style={{
            ...quietButtonStyle,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {t("entry")}
        </a>
      </div>
    </section>
  );
}
