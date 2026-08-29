import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/safe-next-path";

describe("OAuth callback paths", () => {
  it.each([null, "https://evil.example", "//evil.example", "/\\evil.example"])(
    "rejects an unsafe next path: %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/en");
    },
  );

  it.each(["/en", "/es/g/ooooooooooooooooooooooooooooooooooooooooooo"])(
    "keeps an internal next path: %s",
    (value) => {
      expect(safeNextPath(value)).toBe(value);
    },
  );
});
