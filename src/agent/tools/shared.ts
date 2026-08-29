import type { ToolContext } from "@strands-agents/sdk";
import type { JSONValue } from "postgres";

import { sqlClient } from "@/core/db/client";
import type { HouseState, VisitDraft } from "@/core/policy/evaluate-overlap";

import type { AgentDeps } from "../deps";

export async function audit(
  deps: AgentDeps,
  homeId: string,
  context: ToolContext | undefined,
  kind: string,
  payload: Record<string, JSONValue>,
): Promise<void> {
  const sql = sqlClient(deps.db);
  const runId =
    typeof context?.invocationState.runId === "string"
      ? context.invocationState.runId
      : null;
  await sql`
    insert into public.audit_events (home_id, run_id, actor, kind, payload)
    values (${homeId}, ${runId}, 'agent', ${kind}, ${JSON.stringify(payload)}::text::jsonb)
  `;
}

export async function homeIdForInvitation(
  deps: AgentDeps,
  invitationId: string,
): Promise<string> {
  const sql = sqlClient(deps.db);
  const [row] = await sql<{ home_id: string }[]>`
    select home_id from public.invitations where id = ${invitationId}
  `;
  if (!row) throw new Error(`Invitation not found: ${invitationId}`);
  return row.home_id;
}

export async function homeIdForVisit(
  deps: AgentDeps,
  visitId: string,
): Promise<string> {
  const sql = sqlClient(deps.db);
  const [row] = await sql<{ home_id: string }[]>`
    select home_id from public.visits where id = ${visitId}
  `;
  if (!row) throw new Error(`Visit not found: ${visitId}`);
  return row.home_id;
}

export async function loadDraftForTool(
  deps: AgentDeps,
  name: string,
  input: Record<string, unknown>,
): Promise<{
  homeId: string;
  draft: VisitDraft;
  approvalStayHash: string | null;
}> {
  const sql = sqlClient(deps.db);
  if (name === "create_temporary_hold") {
    const invitationId = String(input.invitationId);
    return {
      homeId: await homeIdForInvitation(deps, invitationId),
      draft: {
        stay: input.stay as [string, string],
        adults: Number(input.adults),
        children: Number(input.children ?? 0),
        pets: Number(input.pets ?? 0),
        specialRequests: (input.specialRequests as string[] | undefined) ?? [],
      },
      approvalStayHash: null,
    };
  }

  const visitId = String(input.visitId);
  const [visit] = await sql<
    {
      home_id: string;
      stay_start: string;
      stay_end: string;
      adults: number;
      children: number;
      pets: number;
      special_requests: string[];
      approval_stay_hash: string | null;
    }[]
  >`
    select home_id, lower(stay)::text as stay_start, upper(stay)::text as stay_end,
      adults, children, pets, special_requests, approval_stay_hash
    from public.visits where id = ${visitId}
  `;
  if (!visit) throw new Error(`Visit not found: ${visitId}`);
  return {
    homeId: visit.home_id,
    draft: {
      visitId,
      stay: (input.stay as [string, string] | undefined) ?? [
        visit.stay_start,
        visit.stay_end,
      ],
      adults: Number(input.adults ?? visit.adults),
      children: Number(input.children ?? visit.children),
      pets: Number(input.pets ?? visit.pets),
      specialRequests:
        (input.specialRequests as string[] | undefined) ??
        visit.special_requests,
    },
    approvalStayHash: visit.approval_stay_hash,
  };
}

export async function loadHouseState(
  deps: AgentDeps,
  homeId: string,
  draft: VisitDraft,
): Promise<HouseState> {
  const sql = sqlClient(deps.db);
  const [home] = await sql<
    { pets_together_allowed: boolean; max_families_with_children: number }[]
  >`
    select pets_together_allowed, max_families_with_children
    from public.homes where id = ${homeId}
  `;
  if (!home) throw new Error(`Home not found: ${homeId}`);
  const rooms = await sql<{ id: string; name: string; beds: number }[]>`
    select id, name, beds from public.rooms where home_id = ${homeId} order by name
  `;
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
