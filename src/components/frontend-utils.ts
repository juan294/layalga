const POLL_BASE_DELAY_MS = 1_500;
const POLL_MAX_DELAY_MS = 30_000;

export function localeSwitchHref(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  nextLocale: "en" | "es",
): string {
  if (!/\/runs\/[^/]+\/status\/?$/.test(pathname)) return pathname;

  const approved = new URLSearchParams();
  for (const key of ["token", "returnTo"] as const) {
    const value = searchParams.get(key);
    if (!value) continue;
    approved.set(
      key,
      key === "returnTo"
        ? value.replace(/^\/(?:en|es)(?=\/g\/)/, `/${nextLocale}`)
        : value,
    );
  }
  const query = approved.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function pollDelay(
  failureCount: number,
  random = Math.random(),
): number {
  const exponent = Math.max(0, Math.floor(failureCount));
  const bounded = Math.min(
    POLL_MAX_DELAY_MS,
    POLL_BASE_DELAY_MS * 2 ** exponent,
  );
  const jitter = 0.8 + Math.min(1, Math.max(0, random)) * 0.4;
  return Math.min(POLL_MAX_DELAY_MS, Math.round(bounded * jitter));
}

export function formatHouseholdDateTime(
  value: string,
  locale: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function householdMonth(
  clock: Date | string | undefined,
  visitStart: string | undefined,
  timeZone: string,
  now = new Date(),
): Date {
  if (visitStart && !clock) {
    const [year, month] = visitStart.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(clock ? new Date(clock) : now);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(valueFor("year"), valueFor("month") - 1, 1));
}

export function clockInputValue(value: string, timeZone: string): string {
  const parts = dateTimeParts(new Date(value), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function clockInputToIso(value: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match)
    throw new RangeError("Demo clock value must be a local date and time");

  const [, year, month, day, hour, minute] = match;
  const wallTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  let instant = wallTime - timeZoneOffset(new Date(wallTime), timeZone);
  instant = wallTime - timeZoneOffset(new Date(instant), timeZone);
  return new Date(instant).toISOString();
}

export async function copyText(
  writeText: (value: string) => Promise<void>,
  value: string,
): Promise<boolean> {
  try {
    await writeText(value);
    return true;
  } catch {
    return false;
  }
}

function timeZoneOffset(value: Date, timeZone: string): number {
  const parts = dateTimeParts(value, timeZone);
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedAsUtc - Math.floor(value.getTime() / 1_000) * 1_000;
}

function dateTimeParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: valueFor("year"),
    month: valueFor("month"),
    day: valueFor("day"),
    hour: valueFor("hour"),
    minute: valueFor("minute"),
    second: valueFor("second"),
  };
}
