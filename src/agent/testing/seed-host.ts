import type { Sql } from "postgres";

export interface HostFixture {
  homeId: string;
  hostId: string;
}

/**
 * Seeds a home and a host, ready for a `host_capture` agent run. `homeName`
 * should embed a random suffix (e.g. `randomUUID()`) so concurrent test
 * runs don't collide on the same home.
 */
export async function seedHost(
  sql: Sql,
  homeName: string,
): Promise<HostFixture> {
  const [home] = await sql<{ id: string }[]>`
    insert into public.homes (name, timezone)
    values (${homeName}, 'Europe/Madrid')
    returning id
  `;
  const [host] = await sql<{ id: string }[]>`
    insert into public.hosts (home_id, display_name, locale)
    values (${home!.id}, 'Host', 'en') returning id
  `;
  return { homeId: home!.id, hostId: host!.id };
}

export async function cleanupHost(
  sql: Sql,
  fixture: HostFixture,
): Promise<void> {
  await sql`delete from public.homes where id = ${fixture.homeId}`;
  await sql`delete from public.agent_sessions where session_id = ${`capture_${fixture.hostId}`}`;
}
