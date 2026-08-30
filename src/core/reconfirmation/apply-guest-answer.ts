import type { Clock } from "@/core/clock";
import { sqlClient, type DatabaseClient } from "@/core/db/client";

import { scheduleJobs, type JobScheduler } from "./jobs";
import { applyGuestAnswer, type ReconfirmationVisit } from "./state-machine";

export async function applyGuestReconfirmation(
  database: DatabaseClient,
  clock: Clock,
  scheduler: JobScheduler,
  homeId: string,
  visitId: string,
  answer: "yes" | "change",
): Promise<ReconfirmationVisit> {
  const sql = sqlClient(database);
  const transition = await sql.begin(async (transaction) => {
    const [home] = await transaction<{ id: string }[]>`
      select id from public.homes where id = ${homeId} for update
    `;
    if (!home) throw new Error(`Home not found: ${homeId}`);
    const [row] = await transaction<
      {
        id: string;
        home_id: string;
        stay_start: string;
        status: ReconfirmationVisit["status"];
        confirmed_at: Date | string | null;
        reconfirm_requested_at: Date | string | null;
        reconfirmed_at: Date | string | null;
        escalated_at: Date | string | null;
      }[]
    >`
      select id, home_id, lower(stay)::text as stay_start, status, confirmed_at,
        reconfirm_requested_at, reconfirmed_at, escalated_at
      from public.visits
      where id = ${visitId} and home_id = ${homeId}
      for update
    `;
    if (!row) throw new Error(`Visit not found in task home: ${visitId}`);
    const current: ReconfirmationVisit = {
      id: row.id,
      homeId: row.home_id,
      stayStart: row.stay_start,
      status: row.status,
      confirmedAt: dateOrNull(row.confirmed_at),
      reconfirmRequestedAt: dateOrNull(row.reconfirm_requested_at),
      reconfirmedAt: dateOrNull(row.reconfirmed_at),
      escalatedAt: dateOrNull(row.escalated_at),
    };
    const next = applyGuestAnswer(current, answer, clock.now());
    if (next.visit !== current) {
      await transaction`
        update public.visits
        set status = ${next.visit.status},
          reconfirm_requested_at = ${date(next.visit.reconfirmRequestedAt)},
          reconfirmed_at = ${date(next.visit.reconfirmedAt)},
          escalated_at = ${date(next.visit.escalatedAt)}
        where id = ${visitId} and home_id = ${homeId}
      `;
    }
    return next;
  });
  await scheduleJobs(database, scheduler, transition.jobs);
  return transition.visit;
}

function date(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function dateOrNull(value: Date | string | null): Date | null {
  return value === null ? null : new Date(value);
}
