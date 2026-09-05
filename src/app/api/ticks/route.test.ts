import { describe, expect, it } from "vitest";

import { isTickRequestAuthorized } from "./authorization";

describe("tick route authorization", () => {
  const tickSecret = "t".repeat(32);
  const cronSecret = "c".repeat(32);

  it("fails closed when no secrets are configured", () => {
    const request = new Request("https://example.test/api/ticks");

    expect(isTickRequestAuthorized(request, {})).toBe(false);
  });

  it("accepts the internal tick secret header", () => {
    const request = new Request("https://example.test/api/ticks", {
      headers: { "x-layalga-internal": tickSecret },
    });

    expect(isTickRequestAuthorized(request, { TICK_SECRET: tickSecret })).toBe(
      true,
    );
  });

  it("accepts Vercel Cron bearer authorization", () => {
    const request = new Request("https://example.test/api/ticks", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });

    expect(isTickRequestAuthorized(request, { CRON_SECRET: cronSecret })).toBe(
      true,
    );
  });

  it("rejects configured secrets shorter than 32 bytes", () => {
    const request = new Request("https://example.test/api/ticks", {
      headers: { "x-layalga-internal": "short-secret" },
    });

    expect(
      isTickRequestAuthorized(request, { TICK_SECRET: "short-secret" }),
    ).toBe(false);
  });

  it("does not trust the Vercel Cron user agent without its secret", () => {
    const request = new Request("https://example.test/api/ticks", {
      headers: { "user-agent": "vercel-cron/1.0" },
    });

    expect(isTickRequestAuthorized(request, { CRON_SECRET: cronSecret })).toBe(
      false,
    );
  });
});
