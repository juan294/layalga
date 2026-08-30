import { graphite, ink, sheet, teal } from "./host-styles";

interface StatusChipProps {
  label: string;
  status: string;
}

export function StatusChip({ label, status }: StatusChipProps) {
  const urgent = status === "escalated";
  const settled = status === "reconfirmed" || status === "confirmed";
  return (
    <span
      style={{
        background: urgent ? ink : settled ? teal : sheet,
        border: `1px solid ${urgent || settled ? "transparent" : graphite}`,
        color: urgent || settled ? sheet : graphite,
        display: "inline-block",
        fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
        fontSize: "0.75rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        padding: "0.2rem 0.42rem",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}
