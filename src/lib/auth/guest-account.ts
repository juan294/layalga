import "server-only";

import { getDatabaseConnection } from "@/core/db/client";

export interface GuestAccountVisit {
  id: string;
  partyName: string;
  stay: readonly [string, string];
  status:
    | "hold"
    | "confirmed"
    | "reconfirm_pending"
    | "reconfirmed"
    | "escalated"
    | "cancelled";
  timeZone: string;
}

export async function partyIsClaimedByUser(
  partyId: string,
  authUserId: string,
): Promise<boolean> {
  const [party] = await getDatabaseConnection().sql<{ id: string }[]>`
    select id
    from public.parties
    where id = ${partyId} and auth_user_id = ${authUserId}
  `;
  return Boolean(party);
}

export async function hasPartyForUser(authUserId: string): Promise<boolean> {
  const [party] = await getDatabaseConnection().sql<{ id: string }[]>`
    select id
    from public.parties
    where auth_user_id = ${authUserId}
    limit 1
  `;
  return Boolean(party);
}

export async function loadGuestAccountVisits(
  authUserId: string,
): Promise<GuestAccountVisit[]> {
  const rows = await getDatabaseConnection().sql<
    {
      id: string;
      family_name: string;
      stay_start: string;
      stay_end: string;
      status: GuestAccountVisit["status"];
      timezone: string;
    }[]
  >`
    select v.id, p.family_name,
      lower(v.stay)::text as stay_start,
      upper(v.stay)::text as stay_end,
      v.status,
      h.timezone
    from public.parties p
    join public.visits v
      on v.party_id = p.id and v.home_id = p.home_id
    join public.homes h on h.id = p.home_id
    where p.auth_user_id = ${authUserId}
    order by lower(v.stay) desc, v.id
    limit 20
  `;
  return rows.map((row) => ({
    id: row.id,
    partyName: row.family_name,
    stay: [row.stay_start, row.stay_end],
    status: row.status,
    timeZone: row.timezone,
  }));
}
