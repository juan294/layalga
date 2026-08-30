import { DemoClockPanel } from "layalga";

// The demo-only clock control. Labelled explicitly as simulated time; it posts
// to /api/demo/clock, so the buttons are inert in a preview.
export function HouseholdClock() {
  return (
    <DemoClockPanel
      current="2026-09-18T17:00:00.000Z"
      homeId="demo-home"
      labels={{
        current: "Current demo time",
        chase: "Reconfirmation chase",
        escalation: "Host escalation",
        custom: "Custom date and time",
        set: "Set clock",
        working: "Setting clock…",
        error: "The demo clock could not be updated.",
      }}
      locale="en"
      timeZone="Europe/Madrid"
    />
  );
}
