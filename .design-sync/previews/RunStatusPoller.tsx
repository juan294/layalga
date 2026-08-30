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
        deadlineAt={null}
        initial={{
          id: "run-capture-vega",
          status: "completed",
          summary:
            "Held Cuartu del Teixu and Cuartu del Horreu for Familia Vega, 18-24 September.",
          finishedAt: "2026-09-18T17:04:11.000Z",
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
        deadlineAt="2026-09-21T09:00:00.000Z"
        initial={{
          id: "run-capture-oteros",
          status: "interrupted",
          summary: "Pets need host approval before the rooms can be held.",
          finishedAt: null,
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
        deadlineAt={null}
        initial={{
          id: "run-capture-prieto",
          status: "failed",
          summary: null,
          finishedAt: "2026-09-20T08:07:52.000Z",
        }}
        locale="en"
        returnTo="/en/g/demo-guest-token"
        timeZone="Europe/Madrid"
      />
    </RunShell>
  );
}
