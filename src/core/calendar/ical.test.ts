import { describe, expect, it } from "vitest";

import { calendarEtag, renderICalendar } from "./ical";

describe("iCalendar serialization", () => {
  it("renders stable all-day events with escaping and cancellation tombstones", () => {
    const calendar = renderICalendar({
      calendarName: "Casa, Ayalga; family",
      locale: "en",
      timeZone: "Europe/Madrid",
      events: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          kind: "visit",
          stay: ["2026-10-25", "2026-10-27"],
          status: "confirmed",
          sequence: 2,
          updatedAt: "2026-09-01T10:11:12.000Z",
          guestCount: 4,
          roomLabels: ["Room, one", "Room; two"],
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          kind: "private_block",
          stay: ["2026-11-01", "2026-11-03"],
          status: "cancelled",
          sequence: 1,
          updatedAt: "2026-09-02T03:04:05.000Z",
          guestCount: null,
          roomLabels: ["Garden room"],
        },
      ],
    });

    expect(calendar.endsWith("\r\n")).toBe(true);
    expect(calendar.replaceAll("\r\n", "")).not.toContain("\n");
    expect(calendar).toContain("X-WR-CALNAME:Casa\\, Ayalga\\; family\r\n");
    expect(calendar).toContain("DTSTART;VALUE=DATE:20261025\r\n");
    expect(calendar).toContain("DTEND;VALUE=DATE:20261027\r\n");
    expect(calendar).toContain(
      "UID:visit-11111111-1111-4111-8111-111111111111@layalga.thecreativetoken.com\r\n",
    );
    expect(calendar).toContain("SEQUENCE:2\r\n");
    expect(calendar).toContain("STATUS:CANCELLED\r\n");
    expect(calendar).toContain("Rooms: Room\\, one\\, Room\\; two");
    expect(calendar).not.toContain("20261026");
  });

  it("folds UTF-8 content lines at 75 octets without damaging characters", () => {
    const calendar = renderICalendar({
      calendarName: "L’Ayalga ".repeat(20),
      locale: "es",
      timeZone: "Europe/Madrid",
      events: [],
    });

    for (const line of calendar.split("\r\n").filter(Boolean)) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(calendar.replaceAll("\r\n ", "")).toContain("L’Ayalga ".repeat(20));
    expect(calendar).not.toContain("�");
  });

  it("is deterministic across input order and produces a stable ETag", () => {
    const events = [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        kind: "private_block" as const,
        stay: ["2026-12-02", "2026-12-03"] as const,
        status: "confirmed" as const,
        sequence: 0,
        updatedAt: "2026-09-01T00:00:00.000Z",
        guestCount: null,
        roomLabels: ["B"],
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        kind: "visit" as const,
        stay: ["2026-12-01", "2026-12-02"] as const,
        status: "confirmed" as const,
        sequence: 0,
        updatedAt: "2026-09-01T00:00:00.000Z",
        guestCount: 2,
        roomLabels: ["A"],
      },
    ];
    const input = {
      calendarName: "Household calendar",
      locale: "en" as const,
      timeZone: "Europe/Madrid",
      events,
    };

    const first = renderICalendar(input);
    const second = renderICalendar({ ...input, events: [...events].reverse() });

    expect(second).toBe(first);
    expect(calendarEtag(second)).toBe(calendarEtag(first));
    expect(calendarEtag(first)).toMatch(/^"[a-f0-9]{64}"$/);
  });
});
