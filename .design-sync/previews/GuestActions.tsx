import { Suspense, use } from "react";
import { GuestActions } from "layalga";
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


// GuestActions is an async server component. Calling it once at module scope
// gives each cell a stable promise that `use` can unwrap inside a Suspense
// boundary - the composition is the real component, not a stand-in.
type Element = ReturnType<typeof use>;

const reconfirmable = (GuestActions as unknown as (p: {
  token: string;
  locale: "en" | "es";
  canReconfirm?: boolean;
}) => Promise<Element>)({
  token: "demo-guest-token",
  locale: "en",
  canReconfirm: true,
});

const changeOnly = (GuestActions as unknown as (p: {
  token: string;
  locale: "en" | "es";
  canReconfirm?: boolean;
}) => Promise<Element>)({
  token: "demo-guest-token",
  locale: "en",
  canReconfirm: false,
});

function Resolved({ node }: { node: Promise<Element> }) {
  return <>{use(node)}</>;
}

// A visit awaiting reconfirmation: both the confirm action and the change
// request are offered.
export function AwaitingReconfirmation() {
  return (
    <GuestShell>
      <Suspense fallback={null}>
        <Resolved node={reconfirmable} />
      </Suspense>
    </GuestShell>
  );
}

// A confirmed visit: only the change request remains.
export function ChangeRequestOnly() {
  return (
    <GuestShell>
      <Suspense fallback={null}>
        <Resolved node={changeOnly} />
      </Suspense>
    </GuestShell>
  );
}
