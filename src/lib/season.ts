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

/** The brand's Spanish season names, shown as-is regardless of UI locale
 * (see the sign-in postcard stamps): "Verano", never "Summer". */
export const SEASON_LABEL: Record<Season, string> = {
  primavera: "Primavera",
  verano: "Verano",
  otono: "Otoño",
  invierno: "Invierno",
};

/**
 * currentSeason() reads getMonth()/getDate() in the server or browser's own
 * timezone. The host dashboard's demo clock is a household-local instant, so
 * this resolves the season from its calendar date in the household's own
 * timezone first, the same way householdMonth() resolves a calendar month.
 */
export function householdSeason(now: Date | string, timeZone: string): Season {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return currentSeason(
    new Date(Date.UTC(valueFor("year"), valueFor("month") - 1, valueFor("day"))),
  );
}
