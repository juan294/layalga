import type { Clock } from "@/core/clock";
import { sqlClient, type DatabaseClient } from "@/core/db/client";
import type { HouseState, VisitDraft } from "@/core/policy/evaluate-overlap";
import { listGuestRoomOptions } from "@/core/rooms/availability";

export async function loadHouseState(
  database: DatabaseClient,
  clock: Clock,
  homeId: string,
  draft: VisitDraft,
): Promise<HouseState> {
  const sql = sqlClient(database);
  const [home] = await sql<
    { pets_together_allowed: boolean; max_families_with_children: number }[]
  >`
    select pets_together_allowed, max_families_with_children
    from public.homes where id = ${homeId}
  `;
  if (!home) throw new Error(`Home not found: ${homeId}`);

  const roomOptions = await listGuestRoomOptions(
    database,
    homeId,
    [dateBoundary(draft.stay[0]), dateBoundary(draft.stay[1])],
    draft.adults + draft.children,
    { excludeVisitId: draft.visitId },
  );
  const rooms = roomOptions.map((room) => ({
    id: room.id,
    name: room.guestLabel,
    beds: room.standardCapacity,
  }));
  const visits = await sql<
    {
      id: string;
      stay_start: string;
      stay_end: string;
      adults: number;
      children: number;
      pets: number;
      status: HouseState["visits"][number]["status"];
      room_ids: string[];
    }[]
  >`
    select v.id, lower(v.stay)::text as stay_start, upper(v.stay)::text as stay_end,
      v.adults, v.children, v.pets, v.status,
      coalesce(array_agg(vr.room_id) filter (where vr.room_id is not null), '{}') as room_ids
    from public.visits v
    left join public.visit_rooms vr on vr.visit_id = v.id
    where v.home_id = ${homeId}
      and v.status <> 'cancelled'
      and (v.status <> 'hold' or v.hold_expires_at > ${clock.now().toISOString()})
      and v.stay && daterange(${String(draft.stay[0])}::date, ${String(draft.stay[1])}::date, '[)')
    group by v.id
  `;
  return {
    home: {
      petsTogetherAllowed: home.pets_together_allowed,
      maxFamiliesWithChildren: home.max_families_with_children,
    },
    rooms,
    visits: visits.map((visit) => ({
      id: visit.id,
      stay: [visit.stay_start, visit.stay_end],
      adults: visit.adults,
      children: visit.children,
      pets: visit.pets,
      status: visit.status,
      roomIds: visit.room_ids,
    })),
  };
}

function dateBoundary(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}
