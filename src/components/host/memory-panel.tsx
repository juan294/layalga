import { forgetPartyMemoryAction } from "@/app/[locale]/(host)/actions";

import {
  graphite,
  headingStyle,
  ink,
  labelStyle,
  panelStyle,
  quietButtonStyle,
  rule,
} from "./host-styles";
import { displayRecords, type MemoryRecordItem } from "./memory-record-display";

export type { MemoryRecordItem };

export interface MemoryPartyRecords {
  partyId: string;
  partyName: string;
  records: MemoryRecordItem[];
}

export interface MemoryPanelLabels {
  eyebrow: string;
  title: string;
  description: string;
  recordsEmpty: string;
  forget: string;
}

/* Presentational by contract, the same way RoomLedger and PendingDecisions
   are: every string arrives through `labels`, and the host page owns the
   translation. Renders nothing when `parties` is empty (MEMORY=none, or no
   party of the home has an invitation yet), per the design's "off" state. */
export function MemoryPanel({
  locale,
  parties,
  labels,
}: {
  locale: "en" | "es";
  parties: readonly MemoryPartyRecords[];
  labels: MemoryPanelLabels;
}) {
  if (parties.length === 0) return null;

  return (
    <section style={panelStyle} data-testid="memory-panel">
      <p style={labelStyle}>{labels.eyebrow}</p>
      <h2 style={headingStyle}>{labels.title}</h2>
      <p style={{ color: graphite, lineHeight: 1.6, margin: "0 0 1rem" }}>
        {labels.description}
      </p>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {parties.map((party) => (
          <li
            key={party.partyId}
            style={{
              borderTop: `1px solid ${rule}`,
              padding: "0.85rem 0",
            }}
          >
            <div
              style={{
                alignItems: "baseline",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                justifyContent: "space-between",
              }}
            >
              <strong style={{ color: ink }}>{party.partyName}</strong>
              <form action={forgetPartyMemoryAction}>
                <input name="locale" type="hidden" value={locale} />
                <input name="partyId" type="hidden" value={party.partyId} />
                <button
                  data-testid="forget-memory"
                  style={quietButtonStyle}
                  type="submit"
                >
                  {labels.forget}
                </button>
              </form>
            </div>
            {party.records.length > 0 ? (
              <ul
                style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0 }}
              >
                {displayRecords(party.records).map((record) => (
                  <li
                    key={record.id}
                    style={{
                      borderTop: `1px solid ${rule}`,
                      padding: "0.5rem 0",
                    }}
                  >
                    <div style={{ color: graphite, lineHeight: 1.5 }}>
                      {record.text}
                    </div>
                    <div style={{ ...labelStyle, marginTop: "0.2rem" }}>
                      {record.createdAtLabel}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: graphite, margin: "0.35rem 0 0" }}>
                {labels.recordsEmpty}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
