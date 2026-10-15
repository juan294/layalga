import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { TodayHero } from "@/components/host/today-hero";
import {
  headingStyle,
  ink,
  labelStyle,
  panelStyle,
  paper,
  sectionGridStyle,
} from "@/components/host/host-styles";
import type { Season } from "@/lib/season";

const shellStyle: CSSProperties = {
  background: paper,
  color: ink,
  fontFamily: "var(--font-inter, Arial, sans-serif)",
  minHeight: "100dvh",
  padding: "clamp(1rem, 4vw, 4rem)",
};

/**
 * Shared shell for the two signed-in guest routes (session-based /guest and
 * token-based /g/[token]): the same seasonal hero and panel grid the host
 * Today overview uses, so the two views read as the
 * same product. See docs handoff "Signed-in shell unification".
 */
export async function GuestShell({
  locale,
  status,
  statusKey,
  title,
  partyName,
  season,
  primaryPanel,
  managePanel,
}: {
  locale: "en" | "es";
  status: string;
  statusKey: string;
  title: string;
  partyName: string;
  season: Season;
  primaryPanel: ReactNode;
  managePanel: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "Guest" });

  return (
    <main style={shellStyle}>
      <div style={{ margin: "0 auto", maxWidth: "92rem" }}>
        <article data-status={status} data-testid="guest-status">
          <TodayHero
            eyebrow={t("eyebrow")}
            season={season}
            stampLabel={t(`status.${statusKey}`)}
            title={title}
            welcomeLabel={t("welcome", { party: partyName })}
          />

          <div style={sectionGridStyle}>
            <section data-testid="guest-primary-panel" style={panelStyle}>
              {primaryPanel}
            </section>
            <section style={panelStyle}>
              <p style={labelStyle}>{t("manage.eyebrow")}</p>
              <h2 style={headingStyle}>{t("manage.title")}</h2>
              {managePanel}
            </section>
          </div>

        </article>
      </div>
    </main>
  );
}
