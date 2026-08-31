import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCalendarFeed: vi.fn(),
}));

vi.mock("@/core/calendar/calendar-feed", () => ({
  loadCalendarFeed: mocks.loadCalendarFeed,
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: { marker: "database" } }),
}));

import { GET } from "./route";

describe("calendar feed route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CALENDAR_FEED_SECRET =
      "calendar-secret-that-is-at-least-32-bytes";
  });

  it("returns the same 404 for unknown and revoked capabilities", async () => {
    mocks.loadCalendarFeed.mockResolvedValue(null);

    const unknown = await request("unknown");
    const revoked = await request("revoked");

    expect(unknown.status).toBe(404);
    expect(revoked.status).toBe(404);
    expect(await unknown.text()).toBe(await revoked.text());
  });

  it("returns deterministic private calendar bytes without GET writes", async () => {
    mocks.loadCalendarFeed.mockResolvedValue({
      calendarName: "Casa Ayalga stays",
      locale: "en",
      timeZone: "Europe/Madrid",
      events: [],
    });

    const first = await request("valid");
    const firstBody = await first.text();
    const second = await request("valid");
    const secondBody = await second.text();

    expect(secondBody).toBe(firstBody);
    expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
    expect(first.headers.get("content-type")).toBe(
      "text/calendar; charset=utf-8",
    );
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(first.headers.get("referrer-policy")).toBe("no-referrer");
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.loadCalendarFeed).toHaveBeenCalledTimes(2);
  });

  it("supports conditional refresh without changing the representation", async () => {
    mocks.loadCalendarFeed.mockResolvedValue({
      calendarName: "Casa Ayalga stays",
      locale: "en",
      timeZone: "Europe/Madrid",
      events: [],
    });
    const first = await request("valid");
    const etag = first.headers.get("etag")!;
    const conditional = await request("valid", etag);

    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
    expect(conditional.headers.get("etag")).toBe(etag);
  });
});

async function request(token: string, etag?: string): Promise<Response> {
  return GET(
    new Request(`https://layalga.example/calendar/${token}`, {
      headers: etag ? { "if-none-match": etag } : undefined,
    }),
    { params: Promise.resolve({ token }) },
  );
}
