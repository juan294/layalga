import type { CSSProperties, ReactNode } from "react";

import { ink, paper } from "@/components/host/host-styles";
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
 * background and the max-width column.
 */
export default async function HostLayout({
  children,
  params,
}: HostLayoutProps) {
  const { locale } = await params;
  // Authenticates every host route before any page renders.
  await loadHostContext(locale);

  return (
    <main style={mainStyle}>
      <div style={{ margin: "0 auto", maxWidth: "92rem" }}>
        {children}
      </div>
    </main>
  );
}
