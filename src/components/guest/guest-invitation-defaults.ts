import { partyDefaults } from "@/core/booking/guest-invitation";

export function guestInvitationDefaults(structured: Record<string, unknown>) {
  const party = partyDefaults(structured);
  const preferred = stringPair(structured.preferredStay);
  const flexible = record(structured.flexibleDates);
  const from = preferred?.[0] ?? stringValue(flexible.earliest) ?? "2026-09-18";
  const to = preferred?.[1] ?? stringValue(flexible.latest) ?? "2026-09-28";
  const nights = Math.max(
    1,
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() -
        new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    ),
  );
  const requests = Array.isArray(structured.specialRequests)
    ? structured.specialRequests.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return { from, to, nights, ...party, notes: requests.join("; ") };
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
