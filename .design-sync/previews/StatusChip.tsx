import { StatusChip } from "layalga";

// The five statuses a visit can hold in the household ledger, with the copy the
// host app passes from its `Host.status.*` messages.
const LEDGER_STATUSES: ReadonlyArray<readonly [string, string]> = [
  ["hold", "Hold"],
  ["confirmed", "Confirmed"],
  ["reconfirm_pending", "Reconfirm pending"],
  ["reconfirmed", "Reconfirmed"],
  ["escalated", "Escalated"],
];

export function LedgerVocabulary() {
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}
    >
      {LEDGER_STATUSES.map(([status, label]) => (
        <StatusChip key={status} label={label} status={status} />
      ))}
    </div>
  );
}

// How the chip actually appears: inside a calendar lane, next to the family
// name and the room count.
export function OnAVisitLane() {
  return (
    <div style={{ display: "grid", gap: "0.35rem", maxWidth: "22rem" }}>
      {[
        { family: "Familia Vega", label: "Reconfirmed", status: "reconfirmed", rooms: 2 },
        { family: "The Oteros", label: "Reconfirm pending", status: "reconfirm_pending", rooms: 1 },
        { family: "Casa Prieto", label: "Escalated", status: "escalated", rooms: 1 },
      ].map((lane) => (
        <div
          key={lane.family}
          style={{
            alignItems: "center",
            background: "rgba(12, 97, 91, 0.09)",
            borderBottom: "1px solid var(--teal)",
            borderLeft: "4px solid var(--teal)",
            borderTop: "1px solid var(--teal)",
            color: "var(--ink)",
            display: "flex",
            gap: "0.55rem",
            padding: "0.35rem 0.5rem",
          }}
        >
          <span
            style={{
              flex: 1,
              fontFamily: "var(--font-inter), Arial, sans-serif",
              fontSize: "0.76rem",
              fontWeight: 750,
            }}
          >
            {lane.family}
          </span>
          <StatusChip label={lane.label} status={lane.status} />
          <span
            style={{
              color: "var(--graphite)",
              fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
              fontSize: "0.75rem",
              letterSpacing: "0.08em",
            }}
          >
            {lane.rooms}
          </span>
        </div>
      ))}
    </div>
  );
}
