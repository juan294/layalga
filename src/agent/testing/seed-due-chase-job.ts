import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

export interface DueChaseJobFixture {
  homeId: string;
  hostId: string;
  partyId: string;
  invitationId: string;
  visitId: string;
  jobId: string;
}

/**
 * Seeds a home, host, party, invitation, confirmed visit, and a due
 * `reconfirm_chase` scheduled job, ready for `runDueJobs` or `runJob` to
 * claim immediately. `available_at` is set explicitly in the past rather
 * than left to its `now()` column default -- that default is stamped at
 * insert time, which can land after a `now` snapshot taken before several
 * prior inserts, silently making the job unclaimable.
 */
export async function seedDueChaseJob(
  sql: Sql,
  options: { now?: Date } = {},
): Promise<DueChaseJobFixture> {
  const now = options.now ?? new Date();
  const homeId = randomUUID();
  const hostId = randomUUID();
  const partyId = randomUUID();
  const invitationId = randomUUID();
  const visitId = randomUUID();
  const jobId = randomUUID();
  const stayStart = isoDate(new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000));
  const stayEnd = isoDate(new Date(now.getTime() + 18 * 24 * 60 * 60 * 1000));
  const dueAt = new Date(now.getTime() - 5 * 60 * 1000);
  const confirmedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  await sql`
    insert into public.homes (id, name, timezone)
    values (${homeId}, 'AgentCore fixture home', 'Europe/Madrid')
  `;
  await sql`
    insert into public.hosts (id, home_id, display_name, locale)
    values (${hostId}, ${homeId}, 'Host', 'en')
  `;
  await sql`
    insert into public.parties (id, home_id, family_name, locale, link_token)
    values (${partyId}, ${homeId}, 'Vega', 'es', ${`due-chase-${jobId}`})
  `;
  await sql`
    insert into public.invitations (id, home_id, host_id, party_id, raw_message)
    values (${invitationId}, ${homeId}, ${hostId}, ${partyId}, 'Vega')
  `;
  await sql`
    insert into public.visits (
      id, home_id, party_id, invitation_id, stay, adults, children, pets,
      status, confirmed_at
    ) values (
      ${visitId}, ${homeId}, ${partyId}, ${invitationId},
      daterange(${stayStart}, ${stayEnd}, '[)'), 2, 0, 0,
      'confirmed', ${confirmedAt.toISOString()}
    )
  `;
  await sql`
    insert into public.scheduled_jobs (
      id, home_id, visit_id, kind, due_at, available_at
    ) values (
      ${jobId}, ${homeId}, ${visitId}, 'reconfirm_chase',
      ${dueAt.toISOString()}, ${dueAt.toISOString()}
    )
  `;

  return { homeId, hostId, partyId, invitationId, visitId, jobId };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
