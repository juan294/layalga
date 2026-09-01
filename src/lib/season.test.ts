import { describe, expect, test } from "vitest";

import { SEASONS, currentSeason, parseSeason, type Season } from "./season";

const boundaries: [string, Season][] = [
  ["2026-03-20T12:00:00", "invierno"],
  ["2026-03-21T12:00:00", "primavera"],
  ["2026-06-20T12:00:00", "primavera"],
  ["2026-06-21T12:00:00", "verano"],
  ["2026-09-20T12:00:00", "verano"],
  ["2026-09-21T12:00:00", "otono"],
  ["2026-12-20T12:00:00", "otono"],
  ["2026-12-21T12:00:00", "invierno"],
  ["2027-01-01T12:00:00", "invierno"],
];

describe("seasonal palette", () => {
  test.each(boundaries)("%s falls in %s", (date, season) => {
    expect(currentSeason(new Date(date))).toBe(season);
  });

  test("names a season for every day of the year", () => {
    const day = new Date("2026-01-01T12:00:00");
    while (day.getFullYear() === 2026) {
      expect(SEASONS).toContain(currentSeason(day));
      day.setDate(day.getDate() + 1);
    }
  });

  test("accepts only the four season names as an override", () => {
    expect(parseSeason("otono")).toBe("otono");
    expect(parseSeason("autumn")).toBeNull();
    expect(parseSeason(null)).toBeNull();
    expect(parseSeason(undefined)).toBeNull();
  });
});
