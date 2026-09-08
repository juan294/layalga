import type { ReactNode } from "react";

import { labelStyle, paper, teal } from "./host-styles";

/** The dashed containment zone the design keeps demo tooling inside on the
 * Today overview, visually separating it from the household's real content
 * above without hiding it (the owner wants it inline for the demo). */
export function DemoZone({ tag, children }: { tag: string; children: ReactNode }) {
  return (
    <div
      style={{
        border: `1px dashed ${teal}`,
        marginTop: "clamp(1.5rem, 4vw, 2rem)",
        padding: "clamp(1rem, 3vw, 1.5rem)",
        position: "relative",
      }}
    >
      <span
        style={{
          ...labelStyle,
          background: paper,
          color: teal,
          left: "1rem",
          padding: "0 0.5rem",
          position: "absolute",
          top: "-0.6rem",
        }}
      >
        {tag}
      </span>
      {children}
    </div>
  );
}
