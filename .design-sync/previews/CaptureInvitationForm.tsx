import en from "../../messages/en.json";
import { CaptureInvitationForm } from "layalga";

// Only the idle state renders statically: the agent result, captured details
// and guest link appear after captureInvitationAction returns.
export function CaptureRequest() {
  return (
    <CaptureInvitationForm
      timeZone="Europe/Madrid"
      parties={[]}
      labels={{ ...en.Host.capture, remembered: en.Host.memory.remembered }}
      locale="en"
    />
  );
}
