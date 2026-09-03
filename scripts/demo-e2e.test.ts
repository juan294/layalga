import type { Page } from "@playwright/test";
import { describe, expect, it } from "vitest";

import {
  approvePendingDecision,
  assertCalendarPrivacy,
  captureInvitation,
  parseICalendar,
} from "./demo-e2e";

describe("durable demo browser flows", () => {
  it("waits for queued capture completion before revealing the guest link", async () => {
    const calls: string[] = [];
    const page = fakePage(calls, {
      href: "/en/g/private-token",
      url: "http://127.0.0.1:3008/en",
    });

    await expect(
      captureInvitation(page, "Invite the Vega family"),
    ).resolves.toBe("http://127.0.0.1:3008/en/g/private-token");
    expect(calls).toEqual([
      "host-capture-message:fill:Invite the Vega family",
      "host-capture-submit:click",
      "capture-queued:wait",
      "capture-reveal:wait",
      "capture-reveal:click",
      "guest-link:wait",
      "guest-link:getAttribute:href",
    ]);
  });

  it("follows approval through terminal run status and returns to the host", async () => {
    const calls: string[] = [];
    const page = fakePage(calls, {
      href: null,
      url: "http://127.0.0.1:3008/en",
    });

    await approvePendingDecision(page, "en");

    expect(calls).toEqual([
      "approve-decision:click",
      "waitForURL:/\\/en\\/runs\\/[0-9a-f-]+\\/status/",
      "waitForFunction:completed",
      "run-return:click",
      "waitForURL:/\\/en\\/?(?:[?#].*)?$/",
      "waitForFunction:[data-testid='pending-decision']:0",
    ]);
  });

  it("rejects private values in synthetic calendar evidence", () => {
    const safeCalendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:private-block-test@layalga.example",
      "DTSTART;VALUE=DATE:20260922",
      "DTEND;VALUE=DATE:20260924",
      "STATUS:CONFIRMED",
      "SUMMARY:Private room use",
      "DESCRIPTION:Rooms: Guest Room",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");

    expect(parseICalendar(safeCalendar).events).toHaveLength(1);
    expect(() =>
      assertCalendarPrivacy(safeCalendar, [
        "DEMO-PRIVATE-ROOM-MARKER",
        "Upstairs guest room",
        "private@example.com",
      ]),
    ).not.toThrow();
    const foldedLeak = safeCalendar.replace(
      "DESCRIPTION:Rooms: Guest Room",
      "DESCRIPTION:Private\\, mar\r\n ker\\;with\\\\slash",
    );
    expect(() =>
      assertCalendarPrivacy(foldedLeak, ["Private, marker;with\\slash"]),
    ).toThrow(/exposed forbidden value/);
  });
});

function fakePage(
  calls: string[],
  options: { href: string | null; url: string },
): Page {
  return {
    getByTestId(testId: string) {
      return {
        async click() {
          calls.push(`${testId}:click`);
        },
        async fill(value: string) {
          calls.push(`${testId}:fill:${value}`);
        },
        async getAttribute(name: string) {
          calls.push(`${testId}:getAttribute:${name}`);
          return options.href;
        },
        async waitFor() {
          calls.push(`${testId}:wait`);
        },
      };
    },
    async waitForFunction(_callback: unknown, argument: unknown) {
      if (typeof argument === "string") {
        calls.push(`waitForFunction:${argument}`);
      } else {
        const value = argument as { selector: string; count: number };
        calls.push(`waitForFunction:${value.selector}:${value.count}`);
      }
      return undefined;
    },
    async waitForURL(url: RegExp) {
      calls.push(`waitForURL:${url.toString()}`);
    },
    url() {
      return options.url;
    },
  } as unknown as Page;
}
