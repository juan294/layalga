import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { checkDatabaseHealth } from "./health";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

describe("health unclaimed work age", () => {
  afterAll(() => sql.end());

  async function withQueuedRun<T>(
    availableSecondsAgo: number,
    check: () => Promise<T>,
  ): Promise<T> {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values ('Health queue age', 'Europe/Madrid') returning id
    `;
    try {
      await sql`
        insert into public.runs (
          home_id, session_id, task, status, payload, queue_available_at
        ) values (
          ${home!.id}, 'health-age', 'host_capture', 'queued', '{}'::jsonb,
          now() - ${availableSecondsAgo} * interval '1 second'
        )
      `;
      return await check();
    } finally {
      await sql`delete from public.homes where id = ${home!.id}`;
    }
  }

  it("reports how long claimable work has waited", async () => {
    const health = await withQueuedRun(1_500, () => checkDatabaseHealth());
    expect(health.oldestUnclaimedWorkSeconds).toBeGreaterThanOrEqual(1_500);
  });

  it("ignores queued work that is not yet available", async () => {
    const baseline = await checkDatabaseHealth();
    const health = await withQueuedRun(-3_600, () => checkDatabaseHealth());
    expect(health.oldestUnclaimedWorkSeconds).toBe(
      baseline.oldestUnclaimedWorkSeconds,
    );
  });

  it("counts a due scheduled job that no tick has claimed", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values ('Health job age', 'Europe/Madrid') returning id
    `;
    try {
      const [host] = await sql<{ id: string }[]>`
        insert into public.hosts (home_id, display_name, locale)
        values (${home!.id}, 'Host', 'en') returning id
      `;
      const [party] = await sql<{ id: string }[]>`
        insert into public.parties (home_id, family_name, locale, link_token)
        values (${home!.id}, 'Party', 'en', ${crypto.randomUUID()}) returning id
      `;
      const [invitation] = await sql<{ id: string }[]>`
        insert into public.invitations (home_id, host_id, party_id, raw_message)
        values (${home!.id}, ${host!.id}, ${party!.id}, 'Job') returning id
      `;
      const [visit] = await sql<{ id: string }[]>`
        insert into public.visits (
          home_id, party_id, invitation_id, stay, adults, status
        ) values (
          ${home!.id}, ${party!.id}, ${invitation!.id},
          daterange('2027-03-02', '2027-03-04', '[)'), 1, 'confirmed'
        ) returning id
      `;
      await sql`
        insert into public.scheduled_jobs (home_id, visit_id, kind, due_at)
        values (
          ${home!.id}, ${visit!.id}, 'reconfirm_chase',
          now() - interval '40 minutes'
        )
      `;
      const health = await checkDatabaseHealth();
      expect(health.oldestUnclaimedWorkSeconds).toBeGreaterThanOrEqual(2_400);
    } finally {
      await sql`delete from public.homes where id = ${home!.id}`;
    }
  });
});
