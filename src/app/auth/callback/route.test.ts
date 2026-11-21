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
      "http://localhost:3008/auth/callback?next=%2Fen",
      {
        headers: { cookie: `${OAUTH_NEXT_COOKIE}=%2Fes` },
      },
    );

    expect(oauthNextPath(request)).toBe("/es");
  });
});

it("keeps prepared requester callbacks on the browser's configured origin", async () => {
  const { authRequestOrigin } = await import("@/lib/auth/oauth-next");
  const request = (host: string) =>
    new NextRequest("http://localhost:3008/auth/callback", {
      headers: { host },
    });
  expect(
    authRequestOrigin(request("127.0.0.1:3008"), "http://127.0.0.1:3008"),
  ).toBe("http://127.0.0.1:3008");
  expect(
    authRequestOrigin(request("other.example"), "http://127.0.0.1:3008"),
  ).toBe("http://localhost:3008");
});
