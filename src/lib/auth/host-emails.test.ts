import { describe, expect, it } from "vitest";

import { maskHostEmail, normalizeHostEmail } from "./host-emails";

describe("host identity email", () => {
  it("normalizes the same way for configuration and identity-provider claims", () => {
    expect(normalizeHostEmail(" COVA@Example.COM ")).toBe("cova@example.com");
  });

  it("fails closed for missing or blank addresses", () => {
    expect(normalizeHostEmail(undefined)).toBeNull();
    expect(normalizeHostEmail("   ")).toBeNull();
  });
});

describe("maskHostEmail", () => {
  it("keeps the first character of the local part and masks the rest", () => {
    expect(maskHostEmail("juan294@gmail.com")).toBe("j***@gmail.com");
  });

  it("masks a single-character local part", () => {
    expect(maskHostEmail("a@example.com")).toBe("a***@example.com");
  });

  it("returns null for an address without an @ sign", () => {
    expect(maskHostEmail("not-an-email")).toBeNull();
  });
});
