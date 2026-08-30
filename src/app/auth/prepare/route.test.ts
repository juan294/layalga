import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { OAUTH_NEXT_COOKIE } from "@/lib/auth/oauth-next";

import { POST } from "./route";

describe("OAuth next-path preparation", () => {
  it("stores a safe internal path in an HttpOnly cookie", async () => {
    const next = "/es/g/ooooooooooooooooooooooooooooooooooooooooooo";
    const response = await POST(request(next));

    expect(response.status).toBe(204);
    expect(response.cookies.get(OAUTH_NEXT_COOKIE)?.value).toBe(next);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("normalizes an unsafe path", async () => {
    const response = await POST(request("https://evil.example"));

    expect(response.cookies.get(OAUTH_NEXT_COOKIE)?.value).toBe("/en");
  });

  it("rejects cross-origin preparation", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/auth/prepare", {
        body: JSON.stringify({ next: "/en" }),
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
  });
});

function request(next: string): NextRequest {
  return new NextRequest("http://localhost:3000/auth/prepare", {
    body: JSON.stringify({ next }),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    method: "POST",
  });
}
