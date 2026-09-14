import { describe, expect, it } from "vitest";

import { buildReviewAccessReport, parseSince } from "./review-access";

describe("review access report", () => {
  it("defaults to the previous 48 hours", () => {
    expect(parseSince([], new Date("2026-09-14T12:00:00Z")).toISOString()).toBe(
      "2026-09-12T12:00:00.000Z",
    );
  });

  it("accepts pnpm's argument separator before an explicit timestamp", () => {
    expect(
      parseSince(["--", "--since", "2026-09-13T12:00:00Z"]).toISOString(),
    ).toBe("2026-09-13T12:00:00.000Z");
  });

  it("summarizes only non-identifying access facts", () => {
    expect(
      buildReviewAccessReport(
        [
          {
            access_mode: "host",
            locale: "en",
            created_at: "2026-09-14T10:00:00Z",
          },
          {
            access_mode: "guest",
            locale: "es",
            created_at: "2026-09-14T11:00:00Z",
          },
        ],
        new Date("2026-09-14T09:00:00Z"),
        new Date("2026-09-14T12:00:00Z"),
      ),
    ).toEqual({
      since: "2026-09-14T09:00:00.000Z",
      generatedAt: "2026-09-14T12:00:00.000Z",
      total: 2,
      byMode: { guest: 1, host: 1 },
      events: [
        {
          accessMode: "host",
          locale: "en",
          createdAt: "2026-09-14T10:00:00.000Z",
        },
        {
          accessMode: "guest",
          locale: "es",
          createdAt: "2026-09-14T11:00:00.000Z",
        },
      ],
    });
  });
});
