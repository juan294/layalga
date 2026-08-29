import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

import {
  clockInputToIso,
  clockInputValue,
  copyText,
  householdMonth,
  localeSwitchHref,
  pollDelay,
} from "./frontend-utils";
import { Field } from "./guest/field";
import { CalendarLedger } from "./host/calendar-ledger";

describe("frontend remediation contracts", () => {
  test("preserves only guest run authorization query values on locale changes", () => {
    const query = new URLSearchParams({
      token: "private-token",
      returnTo: "/en/g/private-token",
      claim: "failed",
    });

    expect(localeSwitchHref("/runs/run-id/status", query, "es")).toBe(
      "/runs/run-id/status?token=private-token&returnTo=%2Fes%2Fg%2Fprivate-token",
    );
    expect(localeSwitchHref("/g/private-token", query, "es")).toBe(
      "/g/private-token",
    );
  });

  test("formats and parses demo wall time in the household time zone", () => {
    const instant = "2026-09-15T23:30:00.000Z";

    expect(clockInputValue(instant, "Europe/Madrid")).toBe("2026-09-16T01:30");
    expect(clockInputToIso("2026-09-16T01:30", "Europe/Madrid")).toBe(instant);
    expect(clockInputValue("2026-03-29T00:30:00.000Z", "Europe/Madrid")).toBe(
      "2026-03-29T01:30",
    );
    expect(clockInputToIso("2026-03-29T03:30", "Europe/Madrid")).toBe(
      "2026-03-29T01:30:00.000Z",
    );
  });

  test("selects the calendar month in the household time zone", () => {
    expect(
      householdMonth(
        "2026-08-31T22:30:00.000Z",
        undefined,
        "Europe/Madrid",
      ).toISOString(),
    ).toBe("2026-09-01T00:00:00.000Z");
  });

  test("backs failed polling off with a bounded deterministic midpoint", () => {
    expect(pollDelay(0, 0.5)).toBe(1_500);
    expect(pollDelay(1, 0.5)).toBe(3_000);
    expect(pollDelay(20, 0.5)).toBe(30_000);
    expect(pollDelay(20, 1)).toBe(30_000);
  });

  test("renders unique explicit guest field labels", () => {
    const html = renderToStaticMarkup(
      <>
        <Field label="Adults" name="adults">
          <input name="adults" />
        </Field>
        <Field label="Children" name="children">
          <input name="children" />
        </Field>
      </>,
    );
    const labels = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map(
      (match) => match[1],
    );
    const inputs = [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    expect(inputs).toEqual(labels);
  });

  test("provides one semantic agenda and hides the visual calendar from AT", () => {
    const html = renderToStaticMarkup(
      <CalendarLedger
        emptyLabel="No visits"
        locale="en"
        month={new Date("2026-09-01T00:00:00Z")}
        roomsLabel="Rooms"
        statusLabels={{ confirmed: "Confirmed" }}
        visits={[
          {
            id: "visit-1",
            familyName: "Familia Vega",
            start: "2026-09-18",
            end: "2026-09-21",
            status: "confirmed",
            rooms: ["Horreu", "Teixu"],
          },
        ]}
      />,
    );

    expect(html).toContain('data-testid="calendar-visual"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-testid="calendar-agenda"');
    expect(html).toContain("<ol");
    expect(html).toContain("Horreu, Teixu");
  });

  test("returns a recoverable clipboard failure without exposing the value", async () => {
    expect(
      await copyText(async () => {
        throw new Error("denied");
      }, "private-link"),
    ).toBe(false);
  });

  test("uses truthful bilingual demo and optional-claim messages", () => {
    expect(en.Host.demo.notLive).not.toMatch(/not available/i);
    expect(es.Host.demo.notLive).not.toMatch(/no est[aá] disponible/i);
    expect(en.Guest.claimOptional).toMatch(/optional/i);
    expect(es.Guest.claimOptional).toMatch(/opcional/i);
  });
});
