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
import {
  PendingDecisionButton,
  PendingDecisionRetryButton,
} from "./pending-decision-button";

export interface PendingDecisionItem {
  id: string;
  status: "pending" | "approved" | "declined";
  partyName: string;
  partySummary: string;
  reason: string;
  requestDetail: string | null;
  overlapSummary: string | null;
  note: string | null;
  applicationFailed: boolean;
  requestedStay: string;
  createdAt: string;
}

interface PendingDecisionsProps {
  decisions: PendingDecisionItem[];
  locale: string;
  labels: {
    empty: string;
    reason: string;
    requestedStay: string;
    createdAt: string;
    requestDetail: string;
    overlap: string;
    note: string;
    notePlaceholder: string;
    approve: string;
    approving: string;
    decline: string;
    declining: string;
    retryApproved: string;
    retryApproving: string;
    retryDeclined: string;
    retryDeclining: string;
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
            <dt style={labelStyle}>{labels.requestedStay}</dt>
            <dd style={{ color: graphite, margin: 0 }}>
              {decision.requestedStay}
            </dd>
            <dt style={labelStyle}>{labels.createdAt}</dt>
            <dd style={{ color: graphite, margin: 0 }}>{decision.createdAt}</dd>
            {decision.requestDetail ? (
              <>
                <dt style={labelStyle}>{labels.requestDetail}</dt>
                <dd style={{ color: graphite, margin: 0 }}>
                  {decision.requestDetail}
                </dd>
              </>
            ) : null}
            {decision.overlapSummary ? (
              <>
                <dt style={labelStyle}>{labels.overlap}</dt>
                <dd style={{ color: graphite, margin: 0 }}>
                  {decision.overlapSummary}
                </dd>
              </>
            ) : null}
          </dl>
          {decision.status === "pending" ? (
            <>
              <label
                htmlFor={`decision-note-${decision.id}`}
                style={labelStyle}
              >
                {labels.note}
              </label>
              <input
                id={`decision-note-${decision.id}`}
                name="note"
                placeholder={labels.notePlaceholder}
                style={{ ...fieldStyle, margin: "0.4rem 0 0.65rem" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <PendingDecisionButton
                  idleLabel={labels.approve}
                  pendingLabel={labels.approving}
                  style={buttonStyle}
                  testId="approve-decision"
                  value="approve"
                />
                <PendingDecisionButton
                  idleLabel={labels.decline}
                  pendingLabel={labels.declining}
                  style={quietButtonStyle}
                  value="decline"
                />
              </div>
            </>
          ) : (
            <div>
              {decision.applicationFailed ? (
                <p style={{ color: graphite, lineHeight: 1.5 }}>
                  {labels.retryHelp}
                </p>
              ) : null}
              <PendingDecisionRetryButton
                idleLabel={
                  decision.status === "approved"
                    ? labels.retryApproved
                    : labels.retryDeclined
                }
                pendingLabel={
                  decision.status === "approved"
                    ? labels.retryApproving
                    : labels.retryDeclining
                }
                style={buttonStyle}
              />
            </div>
          )}
        </form>
      ))}
    </div>
  );
}
