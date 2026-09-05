import { z } from "zod";

import { sqlClient, type DatabaseClient } from "../db/client";

export const demoClockInput = z.union([
  z
    .object({ homeId: z.uuid(), action: z.enum(["chase", "escalation"]) })
    .strict(),
  z
    .object({ homeId: z.uuid(), now: z.iso.datetime({ offset: true }) })
    .strict(),
]);

export type DemoClockOutcome = "advanced" | "already_due" | "no_eligible";

export class DemoClockError extends Error {
  constructor(
    readonly code: "invalid_clock" | "backward_clock" | "demo_home_not_found",
  ) {
    super(code);
    this.name = "DemoClockError";
  }
}

/** Auth and demo mutation lease belong to the route. This boundary independently
 * enforces synthetic scope and serializes clock selection with booking changes. */
export async function advanceDemoClock(
  database: DatabaseClient,
  input: z.infer<typeof demoClockInput>,
): Promise<{ now: string; outcome: DemoClockOutcome }> {
  const parsed = demoClockInput.safeParse(input);
  if (!parsed.success) throw new DemoClockError("invalid_clock");
  const request = parsed.data;
  const sql = sqlClient(database);
  return sql.begin(async (transaction) => {
    await transaction`
      select pg_advisory_xact_lock(hashtextextended(${request.homeId}::text, 0))
    `;
    const [home] = await transaction<{ now: Date | string }[]>`
      select case when clock.enabled then clock.now else now() end as now
      from public.homes home
      left join public.demo_clock clock on clock.home_id = home.id
      where home.id = ${request.homeId} and home.demo = true
      for update of home
    `;
    if (!home) throw new DemoClockError("demo_home_not_found");
    const current = new Date(home.now).toISOString();
    let target: string;
    if ("now" in request) {
      target = new Date(request.now).toISOString();
      if (new Date(target) < new Date(current)) {
        throw new DemoClockError("backward_clock");
      }
    } else {
      const kind =
        request.action === "chase" ? "reconfirm_chase" : "reconfirm_escalate";
      const [job] = await transaction<{ target: Date | string }[]>`
        select greatest(${current}::timestamptz, job.due_at, job.available_at) as target
        from public.scheduled_jobs job
        join public.visits visit on visit.id = job.visit_id and visit.home_id = job.home_id
        join public.homes home on home.id = job.home_id
        join public.invitations invitation on invitation.id = visit.invitation_id
          and invitation.home_id = visit.home_id and invitation.party_id = visit.party_id
        where job.home_id = ${request.homeId} and job.kind = ${kind}
          and job.attempt_count < 3 and invitation.status <> 'cancelled'
          and (job.status = 'scheduled' or (
            job.status = 'running'
            and job.claimed_at <= ${current}::timestamptz - interval '10 minutes'
            and not exists (select 1 from public.runs run
              where run.id = job.run_id and run.status in ('queued', 'running'))
          ))
          and (
            (job.kind = 'reconfirm_chase'
              and visit.status in ('confirmed', 'reconfirm_pending')
              and visit.confirmed_at is not null
              and job.due_at >= greatest(visit.confirmed_at,
                ((lower(visit.stay) - 3)::timestamp + interval '9 hours') at time zone home.timezone))
            or (job.kind = 'reconfirm_escalate'
              and (visit.status = 'reconfirm_pending'
                or (visit.status = 'escalated' and job.attempt_count > 0
                  and visit.escalated_at >= job.due_at))
              and visit.reconfirm_requested_at is not null
              and job.due_at >= visit.reconfirm_requested_at + interval '24 hours')
          )
          and lower(visit.stay) >
            (greatest(${current}::timestamptz, job.due_at, job.available_at)
              at time zone home.timezone)::date
        order by target, job.due_at, job.id
        limit 1
        for update of job skip locked
      `;
      // Never advance time to expire a live worker lease. An already stale
      // claim may be retried by the normal scheduler after this transaction.
      if (!job) return { now: current, outcome: "no_eligible" as const };
      target = new Date(job.target).toISOString();
    }
    await transaction`
      insert into public.demo_clock (home_id, now, enabled)
      values (${request.homeId}, ${target}, true)
      on conflict (home_id) do update set now = excluded.now, enabled = true
    `;
    return {
      now: target,
      outcome:
        target === current ? ("already_due" as const) : ("advanced" as const),
    };
  });
}
