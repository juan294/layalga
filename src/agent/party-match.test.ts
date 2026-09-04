import { describe, expect, it } from "vitest";

import { matchFamilyNameInMessage } from "./party-match";

describe("matchFamilyNameInMessage", () => {
  it("matches a household surname regardless of case or accents", () => {
    expect(
      matchFamilyNameInMessage(
        "Familia Vega",
        "Oye, los VEGA quieren venir un finde",
      ),
    ).toBe(true);
    expect(
      matchFamilyNameInMessage(
        "Familia Peña",
        "The Pena family would like to visit",
      ),
    ).toBe(true);
  });

  it("ignores a generic household-name prefix before matching", () => {
    expect(
      matchFamilyNameInMessage("The Oteros", "Inviting the Oteros for a visit"),
    ).toBe(true);
    expect(matchFamilyNameInMessage("La Familia Vega", "los vega")).toBe(true);
  });

  it("does not match an unrelated raw message", () => {
    expect(
      matchFamilyNameInMessage("Familia Vega", "Inviting the Otero family"),
    ).toBe(false);
  });

  it("does not match when nothing but a generic prefix remains", () => {
    expect(matchFamilyNameInMessage("Familia", "Familia visits often")).toBe(
      false,
    );
    expect(matchFamilyNameInMessage("", "anything")).toBe(false);
  });
});
