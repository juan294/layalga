import type { CSSProperties } from "react";

import { rule, sheet, teal } from "./host-styles";

// Full --interactive-target height, not the mock's compact 36px: this
// repo's touch-safety sweep (tests/e2e/mobile-tap-targets) only grandfathers
// the locale switcher as a sub-44px control.
const linkStyle: CSSProperties = {
  alignItems: "center",
  background: sheet,
  border: `1px solid ${rule}`,
  color: teal,
  display: "inline-flex",
  fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
  fontSize: "0.6875rem",
  fontWeight: 700,
  letterSpacing: "0.14em",
  minHeight: "var(--interactive-target)",
  padding: "0 0.9rem",
  textDecoration: "none",
  textTransform: "uppercase",
};

/** Every host sub-page opens with this back link -- there is no persistent
 * tab bar; the hub cards on Today are the only other navigation. */
export function HostBreadcrumb({
  locale,
  label,
}: {
  locale: string;
  label: string;
}) {
  return (
    <nav style={{ margin: "0 0 1.5rem" }}>
      <a href={`/${locale}`} style={linkStyle}>
        {label}
      </a>
    </nav>
  );
}
