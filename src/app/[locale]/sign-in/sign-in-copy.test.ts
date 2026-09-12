import { describe, expect, it } from "vitest";

import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";

describe("sign-in copy", () => {
  it("welcomes people without competitive language", () => {
    expect(en.SignIn.title).toBe("Welcome to L’Ayalga.");
    expect(en.SignIn.description).toContain("plan a stay");
    expect(es.SignIn.title).toBe("Te damos la bienvenida a L’Ayalga.");
    expect(es.SignIn.description).toContain("planificar una estancia");

    expect(en.SignIn.title).not.toContain("Take your place");
    expect(es.SignIn.title).not.toContain("Ocupa tu lugar");
  });
});
