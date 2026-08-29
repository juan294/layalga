import type { ScheduledJobKind, VisitStatus } from "@/core/db/schema";

const ESCALATION_DELAY_MS = 24 * 60 * 60 * 1_000;

export interface ReconfirmationVisit {
  id: string;
  homeId: string;
  stayStart: string;
  status: VisitStatus;
  confirmedAt: Date | null;
  reconfirmRequestedAt: Date | null;
  reconfirmedAt: Date | null;
  escalatedAt: Date | null;
}

export type JobOperation =
  | {
      type: "create";
      homeId: string;
      visitId: string;
      kind: ScheduledJobKind;
      dueAt: Date;
    }
  | {
      type: "cancel";
      visitId: string;
      kind: ScheduledJobKind;
    };

export interface ReconfirmationTransition {
  visit: ReconfirmationVisit;
  jobs: JobOperation[];
}

export function planChase(
  visit: ReconfirmationVisit,
  timezone: string,
  now = visit.confirmedAt,
): ReconfirmationTransition {
  const plannedAt = reconfirmationChaseTime(visit.stayStart, timezone);
  const dueAt = now && now > plannedAt ? new Date(now) : plannedAt;
  return {
    visit,
    jobs: [createJob(visit, "reconfirm_chase", dueAt)],
  };
}

export function applyChase(
  visit: ReconfirmationVisit,
  now: Date,
): ReconfirmationTransition {
  if (visit.status !== "confirmed") return unchanged(visit);

  const requestedAt = validDate(now);
  return {
    visit: {
      ...visit,
      status: "reconfirm_pending",
      reconfirmRequestedAt: requestedAt,
    },
    jobs: [
      createJob(
        visit,
        "reconfirm_escalate",
        new Date(requestedAt.getTime() + ESCALATION_DELAY_MS),
      ),
    ],
  };
}

export function applyGuestAnswer(
  visit: ReconfirmationVisit,
  answer: "yes" | "change",
  now: Date,
): ReconfirmationTransition {
  if (answer !== "yes" || visit.status !== "reconfirm_pending") {
    return unchanged(visit);
  }

  return {
    visit: {
      ...visit,
      status: "reconfirmed",
      reconfirmedAt: validDate(now),
    },
    jobs: [
      {
        type: "cancel",
        visitId: visit.id,
        kind: "reconfirm_escalate",
      },
    ],
  };
}

export function applyEscalation(
  visit: ReconfirmationVisit,
  now: Date,
): ReconfirmationTransition {
  if (visit.status !== "reconfirm_pending") return unchanged(visit);

  return {
    visit: {
      ...visit,
      status: "escalated",
      escalatedAt: validDate(now),
    },
    jobs: [],
  };
}

function createJob(
  visit: Pick<ReconfirmationVisit, "homeId" | "id">,
  kind: ScheduledJobKind,
  dueAt: Date,
): Extract<JobOperation, { type: "create" }> {
  return {
    type: "create",
    homeId: visit.homeId,
    visitId: visit.id,
    kind,
    dueAt: validDate(dueAt),
  };
}

function unchanged(visit: ReconfirmationVisit): ReconfirmationTransition {
  return { visit, jobs: [] };
}

export function reconfirmationChaseTime(
  stayStart: string,
  timezone: string,
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stayStart);
  if (!match) throw new RangeError(`Invalid stay start: ${stayStart}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid stay start: ${stayStart}`);
  }

  const desiredLocalTime = Date.UTC(year, month - 1, day - 3, 9);
  let candidate = desiredLocalTime;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const representedLocalTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    candidate -= representedLocalTime - desiredLocalTime;
  }

  return new Date(candidate);
}

function validDate(value: Date): Date {
  if (!Number.isFinite(value.getTime()))
    throw new RangeError("Invalid reconfirmation time");
  return new Date(value);
}
