import { describe, expect, it } from "vitest";

import { findFixtureGuest, markerSuffix } from "./fixture-household";

describe("markerSuffix", () => {
  it("wraps the marker in a leading space and brackets", () => {
    expect(markerSuffix("release-probe:abc")).toBe(" [release-probe:abc]");
  });

  it("produces a suffix a tagged raw message ends with", () => {
    const marker = "agentcore-smoke:abc-123";
    const rawMessage = `Some message${markerSuffix(marker)}`;
    expect(rawMessage.endsWith(markerSuffix(marker))).toBe(true);
  });
});

describe("findFixtureGuest", () => {
  it("returns the named guest and names a missing one", () => {
    const guest = {
      partyId: "p",
      invitationId: "i",
      familyName: "Familia Vega",
      token: "t",
      preferredStay: ["2099-01-01", "2099-01-03"] as [string, string],
    };
    expect(findFixtureGuest({ parties: [guest] }, "Familia Vega")).toBe(guest);
    expect(() => findFixtureGuest({ parties: [guest] }, "The Parkers")).toThrow(
      "Fixture party is missing: The Parkers",
    );
  });
});
