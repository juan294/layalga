import { RunStatusPoller } from "layalga";
import type { ReactNode } from "react";

// Runs components read their palette from the --run-* custom properties,
// which run-status.module.css defines only on .shell (run_status_shell).
// Rendered outside that wrapper, the card comes up unpainted.
// The inline overrides drop only the full-page sizing, not the palette.
function RunShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="run_status_shell"
      style={{ minHeight: "auto", padding: "1.25rem" }}
    >
      {children}
    </div>
  );
}

// Terminal statuses are shown: a run still `running` would poll /api/runs,
// which no preview can serve. Copy comes from the Runs namespace via the
// next-intl provider.
export function CompletedRun() {
  return (
    <RunShell>
      <RunStatusPoller
        deadlineMs={null}
        initial={{
          id: "run-capture-vega",
          status: "completed",
          summary:
            "Held Cuartu del Teixu and Cuartu del Horreu for Familia Vega, 18-24 September.",
          finishedAt: "2026-09-18T17:04:11.000Z",
          events: [
            {
              at: "2026-09-18T17:03:40.000Z",
              kind: "tool_call",
              name: "hold_rooms",
            },
            {
              at: "2026-09-18T17:04:05.000Z",
              kind: "policy_verdict",
              decision: "allow",
            },
            { at: "2026-09-18T17:04:11.000Z", kind: "decision_applied" },
          ],
        }}
        locale="en"
        returnTo="/en/g/demo-guest-token"
        timeZone="Europe/Madrid"
      />
    </RunShell>
  );
}

// The run stopped for host approval - the interrupt the safety policy raises.
export function InterruptedForApproval() {
  return (
    <RunShell>
      <RunStatusPoller
        deadlineMs={6 * 60_000}
        initial={{
          id: "run-capture-oteros",
          status: "interrupted",
          summary: "Pets need host approval before the rooms can be held.",
          finishedAt: null,
          events: [
            {
              at: "2026-09-21T08:58:12.000Z",
              kind: "tool_call",
              name: "hold_rooms",
            },
            {
              at: "2026-09-21T08:58:30.000Z",
              kind: "policy_verdict",
              decision: "interrupt",
            },
          ],
        }}
        locale="en"
        returnTo="/en/g/demo-guest-token"
        timeZone="Europe/Madrid"
      />
    </RunShell>
  );
}

export function FailedRun() {
  return (
    <RunShell>
      <RunStatusPoller
        deadlineMs={null}
        initial={{
          id: "run-capture-prieto",
          status: "failed",
          summary: null,
          finishedAt: "2026-09-20T08:07:52.000Z",
          events: [
            {
              at: "2026-09-20T08:07:20.000Z",
              kind: "tool_call",
              name: "hold_rooms",
            },
          ],
        }}
        locale="en"
        returnTo="/en/g/demo-guest-token"
        timeZone="Europe/Madrid"
      />
    </RunShell>
  );
}
