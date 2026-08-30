import { decideAction } from "@/app/[locale]/(host)/actions";

import {
  buttonStyle,
  fieldStyle,
  graphite,
  ink,
  labelStyle,
  quietButtonStyle,
  rule,
  teal,
} from "./host-styles";

export interface PendingDecisionItem {
  id: string;
  status: "pending" | "approved" | "declined";
  partyName: string;
  partySummary: string;
  reason: string;
  note: string | null;
  applicationFailed: boolean;
  requestedAt: string;
}

interface PendingDecisionsProps {
  decisions: PendingDecisionItem[];
  locale: string;
  labels: {
    empty: string;
    reason: string;
    requested: string;
    note: string;
    notePlaceholder: string;
    approve: string;
    decline: string;
    retryApproved: string;
    retryDeclined: string;
    retryHelp: string;
  };
}

export function PendingDecisions({
  decisions,
  locale,
  labels,
}: PendingDecisionsProps) {
  if (decisions.length === 0) {
    return <p style={{ color: graphite, margin: 0 }}>{labels.empty}</p>;
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {decisions.map((decision) => (
        <form
          action={decideAction}
          data-testid="pending-decision"
          key={decision.id}
          style={{
            borderLeft: `4px solid ${teal}`,
            borderTop: `1px solid ${rule}`,
            padding: "0.9rem 0 0.2rem 1rem",
          }}
        >
          <input name="decisionId" type="hidden" value={decision.id} />
          <input name="locale" type="hidden" value={locale} />
          {decision.status !== "pending" ? (
            <>
              <input
                name="decision"
                type="hidden"
                value={decision.status === "approved" ? "approve" : "decline"}
              />
              <input name="note" type="hidden" value={decision.note ?? ""} />
            </>
          ) : null}
          <strong
            style={{
              color: ink,
              display: "block",
              fontFamily: "var(--font-fraunces, Georgia, serif)",
              fontSize: "1.25rem",
            }}
          >
            {decision.partyName}
          </strong>
          <p style={{ color: graphite, margin: "0.25rem 0 0" }}>
            {decision.partySummary}
          </p>
          <dl
            style={{
              display: "grid",
              gap: "0.35rem",
              gridTemplateColumns: "max-content 1fr",
              margin: "0.75rem 0",
            }}
          >
            <dt style={labelStyle}>{labels.reason}</dt>
            <dd style={{ margin: 0 }}>{decision.reason}</dd>
            <dt style={labelStyle}>{labels.requested}</dt>
            <dd style={{ color: graphite, margin: 0 }}>
              {decision.requestedAt}
            </dd>
          </dl>
          {decision.status === "pending" ? (
            <>
              <label htmlFor={`decision-note-${decision.id}`} style={labelStyle}>
                {labels.note}
              </label>
              <input
                id={`decision-note-${decision.id}`}
                name="note"
                placeholder={labels.notePlaceholder}
                style={{ ...fieldStyle, margin: "0.4rem 0 0.65rem" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <button
                  data-testid="approve-decision"
                  name="decision"
                  style={buttonStyle}
                  type="submit"
                  value="approve"
                >
                  {labels.approve}
                </button>
                <button
                  name="decision"
                  style={quietButtonStyle}
                  type="submit"
                  value="decline"
                >
                  {labels.decline}
                </button>
              </div>
            </>
          ) : (
            <div>
              {decision.applicationFailed ? (
                <p style={{ color: graphite, lineHeight: 1.5 }}>
                  {labels.retryHelp}
                </p>
              ) : null}
              <button
                data-testid="retry-decision"
                style={buttonStyle}
                type="submit"
              >
                {decision.status === "approved"
                  ? labels.retryApproved
                  : labels.retryDeclined}
              </button>
            </div>
          )}
        </form>
      ))}
    </div>
  );
}
