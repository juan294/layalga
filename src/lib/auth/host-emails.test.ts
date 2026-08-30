import { describe, expect, it } from "vitest";

import { hostEmailIndex } from "./host-emails";

describe("host email allow-list", () => {
  it("matches normalized addresses and preserves configured order", () => {
    expect(hostEmailIndex(" COVA@example.com ", "nel@example.com, cova@example.com")).toBe(1);
  });

  it("fails closed for missing or unlisted addresses", () => {
    expect(hostEmailIndex(undefined, "nel@example.com")).toBe(-1);
    expect(hostEmailIndex("other@example.com", undefined)).toBe(-1);
  });
});
