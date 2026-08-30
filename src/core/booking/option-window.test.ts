import { describe, expect, it } from "vitest";

import { optionWindowIsAllowed } from "./option-window";

describe("guest option window", () => {
  it("accepts 90 days and rejects longer or reversed windows", () => {
    expect(optionWindowIsAllowed("2026-09-01", "2026-11-30")).toBe(true);
    expect(optionWindowIsAllowed("2026-09-01", "2026-12-01")).toBe(false);
    expect(optionWindowIsAllowed("2026-09-02", "2026-09-01")).toBe(false);
  });
});
