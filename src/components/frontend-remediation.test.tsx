import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

import {
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

  test("keeps only an approved booking return when changing the sign-in language", () => {
    const listing =
      "/en/stays/eab9e960-0b40-4f02-8fa8-6df08829cb96?from=2031-01-01&nights=14";
    const switched = localeSwitchHref(
      "/sign-in",
      new URLSearchParams({ next: listing, notes: "private" }),
      "es",
    );
    expect(
      new URL(switched, "https://example.test").searchParams.get("next"),
    ).toBe(listing.replace("/en/", "/es/"));
    expect(switched).not.toContain("private");
    const invalid = new URLSearchParams({ next: listing + "&notes=private" });
    expect(localeSwitchHref("/sign-in", invalid, "es")).toBe("/sign-in");
  });

  test("keeps only a valid consent request when changing the consent language", () => {
    const id = "6qozma2yk5o6zzzh6t7ozzpowz2l4h5t";
    for (const locale of ["en", "es"] as const)
      expect(
        localeSwitchHref(
          "/oauth/consent",
          new URLSearchParams({ authorization_id: id, auth: "failed" }),
          locale,
        ),
      ).toBe(`/oauth/consent?authorization_id=${id}`);
    for (const invalid of ["short", `${id}/x`, `${id}&next=/en`, ""])
      expect(
        localeSwitchHref(
          "/oauth/consent",
          new URLSearchParams({ authorization_id: invalid }),
          "es",
        ),
      ).toBe("/oauth/consent");
    expect(
      localeSwitchHref(
        "/assistants",
        new URLSearchParams({ authorization_id: id }),
        "es",
      ),
    ).toBe("/assistants");
  });

  test("localizes every known internal return path on locale changes", () => {
    const status = "/runs/run-id/status";
    for (const [returnTo, expected] of [
      ["/en/guest", "/es/guest"],
      ["/en/rooms", "/es/rooms"],
      ["/en", "/es"],
      ["/en/g/private-token", "/es/g/private-token"],
    ] as const) {
      expect(
        localeSwitchHref(status, new URLSearchParams({ returnTo }), "es"),
      ).toBe(`${status}?returnTo=${encodeURIComponent(expected)}`);
    }
    expect(
      localeSwitchHref(
        status,
        new URLSearchParams({ returnTo: "https://evil.example/en/guest" }),
        "es",
      ),
    ).toBe(status);
    expect(
      localeSwitchHref(
        status,
        new URLSearchParams({ returnTo: "//evil.example" }),
        "es",
      ),
    ).toBe(status);
  });

  test("keeps the verification capability only on the verification route", () => {
    const query = new URLSearchParams({
      capability: "signed-verification",
      month: "2026-09",
    });
    expect(localeSwitchHref("/guest/verify", query, "es")).toBe(
      "/guest/verify?capability=signed-verification",
    );
    expect(localeSwitchHref("/guest", query, "es")).toBe("/guest");
    expect(localeSwitchHref("/runs/run-id/status", query, "es")).toBe(
      "/runs/run-id/status",
    );
  });

  test("keeps a valid calendar month and drops other calendar fields", () => {
    expect(
      localeSwitchHref(
        "/calendar",
        new URLSearchParams({ month: "2026-09", capability: "x" }),
        "es",
      ),
    ).toBe("/calendar?month=2026-09");
    expect(
      localeSwitchHref(
        "/calendar",
        new URLSearchParams({ month: "september" }),
        "es",
      ),
    ).toBe("/calendar");
  });

  test("formats wall time in the household time zone", () => {
    expect(clockInputValue("2026-09-15T23:30:00.000Z", "Europe/Madrid")).toBe(
      "2026-09-16T01:30",
    );
    expect(clockInputValue("2026-03-29T00:30:00.000Z", "Europe/Madrid")).toBe(
      "2026-03-29T01:30",
    );
  });

  test("selects the calendar month in the household time zone", () => {
    expect(
      householdMonth(
        "Europe/Madrid",
        new Date("2026-08-31T22:30:00.000Z"),
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
        navigation={{
          previousHref: "/en?month=2026-08",
          previousLabel: "Previous month",
          nextHref: "/en?month=2026-10",
          nextLabel: "Next month",
          visitCountLabel: "1 visit this month",
        }}
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

  test("uses truthful bilingual optional-claim messages", () => {
    expect(en.Guest.claimOptional).toMatch(/optional/i);
    expect(es.Guest.claimOptional).toMatch(/opcional/i);
  });
});
