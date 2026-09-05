import { expect, it } from "vitest";
import { guestInvitationDefaults } from "./guest-invitation-defaults";

it("shows captured requests separately without copying them into informational notes", () => {
  const defaults = guestInvitationDefaults({
    specialRequests: ["Ground-floor access"],
  });
  expect(defaults.notes).toBe("");
  expect(defaults.capturedRequests).toEqual(["Ground-floor access"]);
});

it("uses household-local today for an unstructured invitation instead of fixed September dates", () => {
  const defaults = guestInvitationDefaults(
    {},
    { now: new Date("2027-01-31T23:30:00Z"), timeZone: "Europe/Madrid" },
  );
  expect(defaults).toMatchObject({
    from: "2027-02-08",
    to: "2027-02-18",
    nights: 2,
  });
});

it("keeps a valid upcoming explicit stay and its bounded length", () => {
  expect(
    guestInvitationDefaults(
      { preferredStay: ["2027-02-12", "2027-02-15"] },
      { now: new Date("2027-02-01T10:00:00Z"), timeZone: "Europe/Madrid" },
    ),
  ).toMatchObject({ from: "2027-02-12", to: "2027-02-15", nights: 3 });
});

it.each([
  ["2026-09-18", "2026-09-21"],
  ["2027-02-30", "2027-03-04"],
  ["invalid", "2027-03-04"],
  ["2027-02-20", "2027-02-10"],
  ["2027-02-10", "2027-04-10"],
])(
  "falls back safely from stale or invalid preferred dates %s %s",
  (from, to) => {
    expect(
      guestInvitationDefaults(
        { preferredStay: [from, to] },
        { now: new Date("2027-02-01T10:00:00Z"), timeZone: "Europe/Madrid" },
      ),
    ).toMatchObject({ from: "2027-02-08", to: "2027-02-18", nights: 2 });
  },
);
