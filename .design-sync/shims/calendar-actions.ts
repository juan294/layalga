// design-sync preview shim for `@/app/[locale]/(host)/calendar-actions`.
// Reached through CalendarFeedControls, which RoomLedger renders. The real
// module signs feed URLs with CALENDAR_FEED_SECRET behind a host session, so it
// cannot be bundled. The state type is re-imported from the real file (drift is
// a typecheck error, not a silent lie); the bodies are inert and always report
// the idle state, which is what a static card should show.
import type { CalendarFeedActionState } from "../../src/app/[locale]/(host)/calendar-actions";

export type { CalendarFeedActionState };

export async function issueCalendarFeedAction(
  _previous: CalendarFeedActionState,
  _formData: FormData,
): Promise<CalendarFeedActionState> {
  return { status: "idle" };
}

export async function revokeCalendarFeedAction(
  _formData: FormData,
): Promise<void> {}
