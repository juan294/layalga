import { NextResponse } from "next/server";
import { expect, it } from "vitest";

import { clearOAuthNextCookie, OAUTH_NEXT_COOKIE } from "./oauth-next";

it("deletes the return path with an expiry date", () => {
  const response = clearOAuthNextCookie(new NextResponse());
  expect(response.headers.get("set-cookie")).toMatch(
    new RegExp(`^${OAUTH_NEXT_COOKIE}=;.*Expires=Thu, 01 Jan 1970`),
  );
});
