import { CaptureInvitationForm } from "layalga";

// Only the idle state renders statically: the agent result, captured details
// and guest link appear after captureInvitationAction returns.
export function CaptureRequest() {
  return (
    <CaptureInvitationForm
      labels={{
        message: "Invitation message",
        placeholder:
          "For example: Invite Ana and Luis for the first weekend in October.",
        submit: "Capture invitation",
        pending: "Capturing…",
        result: "Agent result",
        structured: "Captured details",
        guestLink: "Guest invitation link",
        copy: "Copy link",
        copied: "Copied",
        copyFailed: "Copy failed. Select and copy the link.",
        emptyError: "Enter an invitation message.",
        failedError: "The invitation could not be captured.",
      }}
      locale="en"
    />
  );
}
