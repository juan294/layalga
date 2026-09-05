import { expect, it } from "vitest";
import { guestInvitationDefaults } from "./guest-invitation-defaults";

it("shows captured requests separately without copying them into informational notes", () => {
  const defaults = guestInvitationDefaults({
    specialRequests: ["Ground-floor access"],
  });
  expect(defaults.notes).toBe("");
  expect(defaults.capturedRequests).toEqual(["Ground-floor access"]);
});
