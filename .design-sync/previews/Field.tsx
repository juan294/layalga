import { Field } from "layalga";
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

// Field owns the label/control pairing and generates the htmlFor id; the
// controls inside are bare elements styled by the guest ledger stylesheet.
export function DateAndCountFields() {
  return (
    <GuestShell>
      <div className="guest_ledger_fieldGrid">
        <Field label="From" name="from">
          <input defaultValue="2026-09-18" name="from" required type="date" />
        </Field>
        <Field label="To" name="to">
          <input defaultValue="2026-09-28" name="to" required type="date" />
        </Field>
        <Field label="Nights" name="nights">
          <input defaultValue={10} max={30} min={1} name="nights" required type="number" />
        </Field>
      </div>
    </GuestShell>
  );
}

export function NotesField() {
  return (
    <GuestShell>
      <div style={{ maxWidth: "28rem" }}>
        <Field label="Notes or access needs" name="notes">
          <textarea
            defaultValue="Ground-floor room if possible; arriving late on the 18th"
            name="notes"
            rows={3}
          />
        </Field>
      </div>
    </GuestShell>
  );
}
