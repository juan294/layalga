import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { oauthNextPath, OAUTH_NEXT_COOKIE } from "@/lib/auth/oauth-next";
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

  it("prefers the prepared HttpOnly-cookie path", () => {
    const request = new NextRequest(
      "http://localhost:3000/auth/callback?next=%2Fen",
      {
        headers: { cookie: `${OAUTH_NEXT_COOKIE}=%2Fes` },
      },
    );

    expect(oauthNextPath(request)).toBe("/es");
  });
});
