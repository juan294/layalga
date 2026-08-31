import { describe, expect, it } from "vitest";

import { hashCalendarFeedToken, issueCalendarFeedToken } from "./feed-token";

describe("calendar feed tokens", () => {
  it("issues opaque tokens and stores only a purpose-bound HMAC", () => {
    const secret = "calendar-secret-that-is-at-least-32-bytes";
    const issued = issueCalendarFeedToken(secret);

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.tokenHash).toEqual(
      hashCalendarFeedToken(issued.token, secret),
    );
    expect(Buffer.from(issued.tokenHash).toString("utf8")).not.toContain(
      issued.token,
    );
    expect(
      hashCalendarFeedToken(issued.token, `${secret}-different`),
    ).not.toEqual(issued.tokenHash);
  });

  it("rejects secrets that are too short", () => {
    expect(() => issueCalendarFeedToken("short")).toThrow(/32 bytes/);
  });
});
