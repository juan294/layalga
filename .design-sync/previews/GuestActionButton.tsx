import { GuestActionButton } from "layalga";
import type { ReactNode } from "react";

// Guest components read their palette from the --guest-* custom properties,
// which guest-ledger.module.css defines only on .shell (guest_ledger_shell).
// Rendered outside that wrapper, every button and rule comes up unpainted.
// The inline overrides drop only the full-page sizing, not the palette.
function GuestShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="guest_ledger_shell"
      style={{ minHeight: "auto", padding: "1.25rem" }}
    >
      {children}
    </div>
  );
}

// The button reads useFormStatus, so it only reports pending inside a form.
// className is supplied by the caller from the guest ledger stylesheet -
// "guest_ledger_primaryButton" / "guest_ledger_secondaryButton".
export function PrimaryAction() {
  return (
    <GuestShell>
      <form>
        <GuestActionButton
          className="guest_ledger_primaryButton"
          label="Yes, we are coming"
          pendingLabel="Confirming…"
          testId="reconfirm-yes"
        />
      </form>
    </GuestShell>
  );
}

export function SecondaryAction() {
  return (
    <GuestShell>
      <form>
        <GuestActionButton
          className="guest_ledger_secondaryButton"
          label="Request change"
          pendingLabel="Sending request…"
          testId="request-change"
        />
      </form>
    </GuestShell>
  );
}
