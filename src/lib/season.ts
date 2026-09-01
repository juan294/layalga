export const SEASONS = ["primavera", "verano", "otono", "invierno"] as const;

export type Season = (typeof SEASONS)[number];

/**
 * The seasonal palette rotates on the boundaries fixed by the design handoff:
 * Mar 21, Jun 21, Sep 21, Dec 21, read from the local calendar date.
 */
export function currentSeason(date: Date = new Date()): Season {
  const monthDay = (date.getMonth() + 1) * 100 + date.getDate();
  if (monthDay >= 321 && monthDay <= 620) return "primavera";
  if (monthDay >= 621 && monthDay <= 920) return "verano";
  if (monthDay >= 921 && monthDay <= 1220) return "otono";
  return "invierno";
}

export function parseSeason(value: string | null | undefined): Season | null {
  return SEASONS.find((season) => season === value) ?? null;
}
