import { GuestInviteForm } from "layalga";
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


// Only step 1 renders statically: the guest-count and notes step appears after
// findGuestOptions returns availability, which needs a server action. The
// defaults are the ones the guest page derives from a captured invitation
// (invitationDefaults in src/app/[locale]/g/[token]/page.tsx).
export function FindDatesStep() {
  return (
    <GuestShell>
      <GuestInviteForm
      defaults={{
        from: "2026-09-18",
        to: "2026-09-28",
        nights: 10,
        adults: 2,
        children: 1,
        pets: 0,
        notes: "Ground-floor room if possible; arriving late on the 18th",
      }}
      locale="en"
        token="demo-invitation-token"
      />
    </GuestShell>
  );
}
