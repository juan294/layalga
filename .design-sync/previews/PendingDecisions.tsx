import { PendingDecisions } from "layalga";

// Labels are the host page's own Host.decisions.* copy.
const LABELS = {
  empty: "No decisions need your review.",
  reason: "Reason for review",
  requested: "Requested stay",
  note: "Note",
  notePlaceholder: "Add an optional note for the guest.",
  approve: "Approve",
  decline: "Decline",
  retryApproved: "Retry approval",
  retryDeclined: "Retry decline",
  retryHelp:
    "Your decision was saved, but the booking run did not finish. Retry the recorded decision.",
};

export function AwaitingHostApproval() {
  return (
    <PendingDecisions
      decisions={[
        {
          id: "decision-vega",
          status: "pending",
          partyName: "Familia Vega",
          partySummary: "2 adults · 1 children · 0 pets",
          reason: "Children need host approval",
          note: null,
          applicationFailed: false,
          requestedAt: "18 Sept 2026, 19:40",
        },
        {
          id: "decision-oteros",
          status: "pending",
          partyName: "The Oteros",
          partySummary: "2 adults · 0 children · 1 pets",
          reason: "Pets need host approval",
          note: "They asked about the courtyard gate.",
          applicationFailed: false,
          requestedAt: "19 Sept 2026, 09:15",
        },
      ]}
      labels={LABELS}
      locale="en"
    />
  );
}

// A decision the host already made, whose booking run failed to apply - the
// retry affordance the host needs.
export function RetryAfterFailedRun() {
  return (
    <PendingDecisions
      decisions={[
        {
          id: "decision-prieto",
          status: "approved",
          partyName: "Casa Prieto",
          partySummary: "4 adults · 2 children · 0 pets",
          reason: "The party needs more beds than are available",
          note: "Approved the extra bed in Cuartu del Horreu.",
          applicationFailed: true,
          requestedAt: "20 Sept 2026, 08:02",
        },
      ]}
      labels={LABELS}
      locale="en"
    />
  );
}

export function NothingToReview() {
  return <PendingDecisions decisions={[]} labels={LABELS} locale="en" />;
}
