import { describe, expect, it } from "vitest";

import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";

describe("sign-in copy", () => {
  it("welcomes people without competitive language", () => {
    expect(en.SignIn.title).toBe("Welcome to our home.");
    expect(en.SignIn.description).toBe(
      "Let us know when you want to come visit and we'll take care of the rest. We're happy to have you!",
    );
    expect(es.SignIn.title).toBe("Te damos la bienvenida a nuestra casa.");
    expect(es.SignIn.description).toBe(
      "Dinos cuándo quieres venir a visitarnos y nos ocuparemos del resto. ¡Nos alegra recibirte!",
    );

    expect(en.SignIn.title).not.toContain("Take your place");
    expect(es.SignIn.title).not.toContain("Ocupa tu lugar");
  });
});
