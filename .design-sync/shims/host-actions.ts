// design-sync preview shim for `@/app/[locale]/(host)/actions`.
// The real module is a "use server" file that reaches Supabase, Drizzle and the
// Strands agent; it cannot be bundled into a browser preview. Signatures and
// types below mirror the real exports exactly (types are re-imported from the
// real file, so drift is a typecheck error, not a silent lie). The bodies are
// inert because static preview cards never submit.
import type {
  CaptureResultState,
  CaptureState,
} from "../../src/app/[locale]/(host)/actions";

export type { CaptureResultState, CaptureState };

export async function captureInvitationAction(
  _previous: CaptureState,
  _formData: FormData,
): Promise<CaptureState> {
  return { status: "idle" };
}

export async function revealCapturedInvitationAction(
  _previous: CaptureResultState,
  _formData: FormData,
): Promise<CaptureResultState> {
  return { status: "idle" };
}

export async function decideAction(_formData: FormData): Promise<void> {}
