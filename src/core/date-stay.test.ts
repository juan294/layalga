import { describe, expect, it } from "vitest";

import { isIsoDate, validateDateStay } from "./date-stay";

describe("strict ISO date stays", () => {
  it("accepts real dates and rejects normalized or empty ranges", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(() => validateDateStay(["2026-09-18", "2026-09-21"])).not.toThrow();
    expect(() => validateDateStay(["2026-02-31", "2026-03-03"])).toThrow();
    expect(() => validateDateStay(["2026-09-21", "2026-09-21"])).toThrow();
  });
});
