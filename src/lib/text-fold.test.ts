import { describe, expect, it } from "vitest";

import { foldText } from "./text-fold";

describe("foldText", () => {
  it("lowercases and strips diacritics", () => {
    expect(foldText("Peña")).toBe("pena");
    expect(foldText("VEGA")).toBe("vega");
  });

  it("collapses whitespace and trims", () => {
    expect(foldText("  los   Vega  ")).toBe("los vega");
  });
});
