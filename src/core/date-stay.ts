export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function validateDateStay(
  stay: readonly [string, string],
  message = "Stay must be a valid, non-empty half-open date range",
): void {
  if (!isIsoDate(stay[0]) || !isIsoDate(stay[1]) || stay[0] >= stay[1]) {
    throw new RangeError(message);
  }
}
