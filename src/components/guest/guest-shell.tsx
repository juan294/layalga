import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { DemoZone } from "@/components/host/demo-zone";
import { TodayHero } from "@/components/host/today-hero";
import {
  headingStyle,
  ink,
  labelStyle,
  panelStyle,
  paper,
  sectionGridStyle,
  sheet,
  teal,
} from "@/components/host/host-styles";
import type { Season } from "@/lib/season";

const shellStyle: CSSProperties = {
  background: paper,
  color: ink,
  fontFamily: "var(--font-inter, Arial, sans-serif)",
  minHeight: "100dvh",
  padding: "clamp(1rem, 4vw, 4rem)",
};

const demoBandStyle: CSSProperties = {
  alignItems: "center",
  background: teal,
  color: sheet,
  display: "flex",
  flexWrap: "wrap",
  fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
  fontSize: "0.75rem",
  fontWeight: 750,
  justifyContent: "space-between",
  letterSpacing: "0.1em",
  marginBottom: "1rem",
  padding: "0.65rem 0.9rem",
  textTransform: "uppercase",
};

/**
 * Shared shell for the two signed-in guest routes (session-based /guest and
 * token-based /g/[token]): the same seasonal hero, panel grid and demo
 * containment the host Today overview uses, so the two views read as the
 * same product. See docs handoff "Signed-in shell unification".
 */
export async function GuestShell({
  locale,
  status,
  statusKey,
  title,
  partyName,
  season,
  showDemo,
  primaryPanel,
  managePanel,
  demoGuide,
}: {
  locale: "en" | "es";
  status: string;
  statusKey: string;
  title: string;
  partyName: string;
  season: Season;
  showDemo: boolean;
  primaryPanel: ReactNode;
  managePanel: ReactNode;
  demoGuide: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "Guest" });
  const tHost = await getTranslations({ locale, namespace: "Host" });

  return (
    <main style={shellStyle}>
      <div style={{ margin: "0 auto", maxWidth: "92rem" }}>
        {showDemo ? (
          <aside style={demoBandStyle}>
            <span>{tHost("demo.banner")}</span>
            <span>{tHost("demo.notLive")}</span>
          </aside>
        ) : null}

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

          {showDemo && demoGuide ? (
            <DemoZone tag={tHost("demoZone.tag")}>{demoGuide}</DemoZone>
          ) : null}
        </article>
      </div>
    </main>
  );
}
