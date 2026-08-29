const DAY_MS = 24 * 60 * 60 * 1_000;

export const MAX_OPTION_WINDOW_DAYS = 90;
export const MAX_VISIT_OPTIONS = 90;

export function optionWindowIsAllowed(from: string, to: string): boolean {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return end > start && end - start <= MAX_OPTION_WINDOW_DAYS * DAY_MS;
}
