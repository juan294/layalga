import { createHash } from "node:crypto";

import type { Locale, StayRange } from "@/core/db/schema";

export interface CalendarEvent {
  id: string;
  kind: "visit" | "private_block";
  stay: StayRange;
  status: "confirmed" | "cancelled";
  sequence: number;
  updatedAt: Date | string;
  guestCount: number | null;
  roomLabels: readonly string[];
}

export interface CalendarDocument {
  calendarName: string;
  locale: Locale;
  timeZone: string;
  events: readonly CalendarEvent[];
}

const COPY = {
  en: {
    visitSummary: "Guest stay",
    blockSummary: "Private room use",
    guests: "Guests",
    rooms: "Rooms",
  },
  es: {
    visitSummary: "Estancia de invitados",
    blockSummary: "Uso privado de habitaciones",
    guests: "Huéspedes",
    rooms: "Habitaciones",
  },
} as const;

export function renderICalendar(input: CalendarDocument): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//L'Ayalga//Household calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.calendarName)}`,
    `X-WR-TIMEZONE:${escapeText(input.timeZone)}`,
  ];

  const events = [...input.events].sort(
    (left, right) =>
      left.stay[0].localeCompare(right.stay[0]) ||
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id),
  );
  for (const event of events) lines.push(...eventLines(event, input.locale));
  lines.push("END:VCALENDAR");
  return `${lines.flatMap(foldLine).join("\r\n")}\r\n`;
}

export function calendarEtag(body: string): string {
  return `"${createHash("sha256").update(body, "utf8").digest("hex")}"`;
}

function eventLines(event: CalendarEvent, locale: Locale): string[] {
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
    throw new RangeError("Calendar sequence must be a non-negative integer");
  }
  const copy = COPY[locale];
  const description = [
    event.kind === "visit" && event.guestCount !== null
      ? `${copy.guests}: ${event.guestCount}`
      : null,
    event.roomLabels.length > 0
      ? `${copy.rooms}: ${event.roomLabels.join(", ")}`
      : null,
  ]
    .filter((value): value is string => value !== null)
    .join("\n");
  const prefix = event.kind === "visit" ? "visit" : "private-block";

  return [
    "BEGIN:VEVENT",
    `UID:${prefix}-${event.id}@layalga.thecreativetoken.com`,
    `DTSTAMP:${timestamp(event.updatedAt)}`,
    `LAST-MODIFIED:${timestamp(event.updatedAt)}`,
    `DTSTART;VALUE=DATE:${calendarDate(event.stay[0])}`,
    `DTEND;VALUE=DATE:${calendarDate(event.stay[1])}`,
    `SEQUENCE:${event.sequence}`,
    `STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapeText(
      event.kind === "visit" ? copy.visitSummary : copy.blockSummary,
    )}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    "TRANSP:OPAQUE",
    "END:VEVENT",
  ];
}

function calendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`Invalid all-day calendar date: ${value}`);
  }
  return value.replaceAll("-", "");
}

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Invalid calendar timestamp");
  }
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function foldLine(line: string): string[] {
  const output: string[] = [];
  let current = "";
  for (const character of line) {
    if (Buffer.byteLength(current + character, "utf8") > 75) {
      output.push(current);
      current = ` ${character}`;
    } else {
      current += character;
    }
  }
  output.push(current);
  return output;
}
