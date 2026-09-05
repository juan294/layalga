import { partyDefaults } from "@/core/booking/guest-invitation";
import { optionWindowIsAllowed } from "@/core/booking/option-window";
import { clockInputValue } from "../frontend-utils";

export function guestInvitationDefaults(
  structured: Record<string, unknown>,
  {
    now = new Date(),
    timeZone = "UTC",
  }: { now?: Date; timeZone?: string } = {},
) {
  const party = partyDefaults(structured);
  const today = clockInputValue(now.toISOString(), timeZone).slice(0, 10);
  const preferred = stringPair(structured.preferredStay);
  const flexible = record(structured.flexibleDates);
  const preferredValid =
    preferred &&
    validWindow(preferred[0], preferred[1], today) &&
    daysBetween(...preferred) <= 30;
  const flexibleFrom = stringValue(flexible.earliest);
  const flexibleTo = stringValue(flexible.latest);
  const flexibleValid =
    flexibleFrom && flexibleTo && validWindow(flexibleFrom, flexibleTo, today);
  const from = preferredValid
    ? preferred[0]
    : flexibleValid
      ? flexibleFrom
      : addDays(today, 7);
  const to = preferredValid
    ? preferred[1]
    : flexibleValid
      ? flexibleTo
      : addDays(today, 17);
  const nights = preferredValid
    ? daysBetween(from, to)
    : Math.min(2, daysBetween(from, to));
  const requests = Array.isArray(structured.specialRequests)
    ? structured.specialRequests.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return { from, to, nights, ...party, notes: "", capturedRequests: requests };
}

function validWindow(from: string, to: string, today: string): boolean {
  return from >= today && optionWindowIsAllowed(from, to);
}

function daysBetween(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000
  );
}

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function stringPair(value: unknown): readonly [string, string] | null {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string"
    ? [value[0], value[1]]
    : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
