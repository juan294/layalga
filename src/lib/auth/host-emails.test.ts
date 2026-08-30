import { describe, expect, it } from "vitest";

import { normalizeHostEmail } from "./host-emails";

describe("host identity email", () => {
  it("normalizes the same way for configuration and identity-provider claims", () => {
    expect(normalizeHostEmail(" COVA@Example.COM ")).toBe("cova@example.com");
  });

  it("fails closed for missing or blank addresses", () => {
    expect(normalizeHostEmail(undefined)).toBeNull();
    expect(normalizeHostEmail("   ")).toBeNull();
  });
});
