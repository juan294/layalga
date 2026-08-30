import type { JSONValue } from "postgres";

import { sqlClient } from "@/core/db/client";
import { loadHouseState as loadCoreHouseState } from "@/core/booking/house-state";
import type { HouseState, VisitDraft } from "@/core/policy/evaluate-overlap";

import type { AgentDeps } from "../ports";

export async function audit(
  deps: AgentDeps,
  homeId: string,
  context: { invocationState: Record<string, unknown> } | undefined,
  kind: string,
  payload: Record<string, JSONValue>,
): Promise<void> {
  assertHomeAuthority(deps, homeId);
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
  assertHomeAuthority(deps, row.home_id);
  if (
    deps.authority?.invitationId &&
    deps.authority.invitationId !== invitationId
  ) {
    throw new Error("Invitation is outside the agent task scope");
  }
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
  assertHomeAuthority(deps, row.home_id);
  if (deps.authority?.visitId && deps.authority.visitId !== visitId) {
    throw new Error("Visit is outside the agent task scope");
  }
  return row.home_id;
}

export function requireAuthority(
  deps: AgentDeps,
): NonNullable<AgentDeps["authority"]> {
  if (!deps.authority) throw new Error("Agent task authority is required");
  return deps.authority;
}

export function assertHomeAuthority(deps: AgentDeps, homeId: string): void {
  if (deps.authority && deps.authority.homeId !== homeId) {
    throw new Error("Record is outside the agent task home");
  }
}

export async function loadDraftForTool(
  deps: AgentDeps,
  name: string,
  input: Record<string, JSONValue>,
): Promise<{
  homeId: string;
  draft: VisitDraft;
  approvalStayHash: string | null;
  sanitizedInput: Record<string, JSONValue>;
}> {
  const sql = sqlClient(deps.db);
  const sanitizedInput = { ...input };
  delete sanitizedInput.approvedBy;
  if (name === "create_temporary_hold") {
    const invitationId = String(input.invitationId);
    const submission = deps.authority?.guestSubmission;
    if (!submission) {
      throw new Error(
        "A trusted guest submission is required to create a hold",
      );
    }
    const draft: VisitDraft = {
      stay: submission.stay,
      adults: submission.adults,
      children: submission.children,
      pets: submission.pets,
      specialRequests: submission.specialRequests,
    };
    return {
      homeId: await homeIdForInvitation(deps, invitationId),
      draft,
      approvalStayHash: null,
      sanitizedInput: {
        ...sanitizedInput,
        invitationId,
        stay: draft.stay as [string, string],
        adults: draft.adults,
        children: draft.children,
        pets: draft.pets,
        specialRequests: [...draft.specialRequests],
      },
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
  assertHomeAuthority(deps, visit.home_id);
  if (deps.authority?.visitId && deps.authority.visitId !== visitId) {
    throw new Error("Visit is outside the agent task scope");
  }
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
    sanitizedInput,
  };
}

export async function loadHouseState(
  deps: AgentDeps,
  homeId: string,
  draft: VisitDraft,
): Promise<HouseState> {
  return loadCoreHouseState(deps.db, deps.clock, homeId, draft);
}
