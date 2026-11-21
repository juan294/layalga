import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

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
      new NextRequest("http://localhost:3008/auth/prepare", {
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
  return new NextRequest("http://localhost:3008/auth/prepare", {
    body: JSON.stringify({ next }),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3008",
    },
    method: "POST",
  });
}

it("accepts the configured browser origin when Next normalizes the loopback request URL", async () => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3008");
  try {
    const response = await POST(
      new NextRequest("http://localhost:3008/auth/prepare", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:3008",
          host: "127.0.0.1:3008",
          "content-type": "application/json",
        },
        body: JSON.stringify({ next: "/en/requests/review" }),
      }),
    );
    expect(response.status).toBe(204);
  } finally {
    vi.unstubAllEnvs();
  }
});
