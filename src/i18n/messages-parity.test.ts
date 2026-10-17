import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("locale messages", () => {
  it("define the same keys in English and Spanish", () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });

  it.each([
    ["English", en],
    ["Spanish", es],
  ])(
    "keep the host dashboard apart from the guest view in %s",
    (_name, messages) => {
      expect(messages.Host.nav.backToToday).toBe(`← ${messages.Host.title}`);
      expect(messages.Host.eyebrow).not.toBe(messages.Host.title);
    },
  );
});
