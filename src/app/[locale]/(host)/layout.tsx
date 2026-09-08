import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { ink, paper, sheet, teal } from "@/components/host/host-styles";
import { loadHostContext } from "./host-context";

const mainStyle: CSSProperties = {
  background: paper,
  color: ink,
  display: "block",
  fontFamily: "var(--font-inter, Arial, sans-serif)",
  minHeight: "100dvh",
  padding: "clamp(1rem, 4vw, 4rem)",
  textAlign: "left",
};

interface HostLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Shared shell for the Today overview and its five sub-routes: the page
 * background, the max-width column, and the "synthetic demo data" band the
 * design handoff keeps at the very top across every host route (it sits
 * above <main> in the mock, framing every view, not just Today).
 */
export default async function HostLayout({
  children,
  params,
}: HostLayoutProps) {
  const { locale } = await params;
  const { host, locale: safeLocale } = await loadHostContext(locale);
  const t = await getTranslations({ locale: safeLocale, namespace: "Host" });

  return (
    <main style={mainStyle}>
      <div style={{ margin: "0 auto", maxWidth: "92rem" }}>
        {process.env.DEMO_MODE === "true" && host.demo ? (
          <aside
            style={{
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
            }}
          >
            <span>{t("demo.banner")}</span>
            <span>{t("demo.notLive")}</span>
          </aside>
        ) : null}
        {children}
      </div>
    </main>
  );
}
