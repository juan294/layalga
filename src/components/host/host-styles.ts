import type { CSSProperties } from "react";

export const ink = "var(--ink)";
export const paper = "var(--paper)";
export const sheet = "var(--sheet)";
export const teal = "var(--teal)";
export const graphite = "var(--graphite)";
export const rule = "var(--rule)";

export const panelStyle: CSSProperties = {
  background: sheet,
  border: `1px solid ${ink}`,
  boxShadow: "4px 4px 0 rgba(32, 35, 31, 0.12)",
  padding: "clamp(1rem, 3vw, 1.75rem)",
};

export const labelStyle: CSSProperties = {
  color: graphite,
  fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  margin: 0,
  textTransform: "uppercase",
};

export const headingStyle: CSSProperties = {
  color: ink,
  fontFamily: "var(--font-fraunces, Georgia, serif)",
  fontSize: "clamp(1.65rem, 4vw, 2.5rem)",
  fontWeight: 600,
  letterSpacing: "-0.025em",
  lineHeight: 1.05,
  margin: "0.4rem 0 1.25rem",
};

export const fieldStyle: CSSProperties = {
  background: "transparent",
  border: `1px solid ${rule}`,
  borderRadius: 0,
  color: ink,
  font: "inherit",
  padding: "0.75rem",
  width: "100%",
};

export const buttonStyle: CSSProperties = {
  background: ink,
  border: `1px solid ${ink}`,
  borderRadius: 0,
  color: sheet,
  cursor: "pointer",
  fontFamily: "var(--font-inter, Arial, sans-serif)",
  fontSize: "0.8rem",
  fontWeight: 750,
  letterSpacing: "0.04em",
  padding: "0.7rem 1rem",
};

export const quietButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "transparent",
  color: ink,
};
