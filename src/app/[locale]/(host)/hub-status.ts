import "@/core/server-only";

import { sqlClient, type DatabaseClient } from "@/core/db/client";
import { loadHouseholdPolicy } from "@/core/policy/settings";

export interface HubStatusData {
  roomsAvailable: number;
  roomsWithheld: number;
  visitsThisMonth: number;
  familiesOnFile: number;
  emailPingsEnabled: boolean;
  maxFamiliesWithChildren: number;
  activityRecorded: boolean;
}

/**
 * One lightweight count per sub-page, so the Today overview's hub cards can
 * show a live status line before the host ever opens the page it links to.
 * Deliberately separate from each sub-page's own (heavier) data loader.
 */
export async function loadHubStatuses(
  database: DatabaseClient,
  homeId: string,
  hostId: string,
  monthWindow: readonly [string, string],
): Promise<HubStatusData> {
  const sql = sqlClient(database);
  const [
    [rooms],
    [visits],
    [guests],
    [emailPings],
    [activity],
    policy,
  ] = await Promise.all([
    sql<{ available: number; withheld: number }[]>`
      select
        count(*) filter (where inventory_state = 'available')::int as available,
        count(*) filter (where inventory_state = 'withheld')::int as withheld
      from public.rooms
      where home_id = ${homeId}
    `,
    sql<{ count: number }[]>`
      select count(*)::int as count
      from public.visits
      where home_id = ${homeId}
        and status <> 'cancelled'
        and stay && daterange(${monthWindow[0]}::date, ${monthWindow[1]}::date, '[)')
    `,
    sql<{ count: number }[]>`
      select count(distinct party.id)::int as count
      from public.parties party
      join public.invitations invitation on invitation.party_id = party.id
      where party.home_id = ${homeId}
    `,
    sql<{ email_pings: boolean | null }[]>`
      select settings.email_pings
      from public.hosts host
      left join public.host_notification_settings settings
        on settings.host_id = host.id
      where host.id = ${hostId}
    `,
    sql<{ recorded: boolean }[]>`
      select exists (
        select 1 from public.audit_events where home_id = ${homeId}
        union all
        select 1 from public.notifications
        where home_id = ${homeId} and recipient_kind = 'host' and recipient_id = ${hostId}
      ) as recorded
    `,
    loadHouseholdPolicy(database, homeId, hostId),
  ]);

  return {
    roomsAvailable: rooms?.available ?? 0,
    roomsWithheld: rooms?.withheld ?? 0,
    visitsThisMonth: visits?.count ?? 0,
    familiesOnFile: guests?.count ?? 0,
    emailPingsEnabled: emailPings?.email_pings ?? true,
    maxFamiliesWithChildren: policy.maxFamiliesWithChildren,
    activityRecorded: activity?.recorded ?? false,
  };
}
