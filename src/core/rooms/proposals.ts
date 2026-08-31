import "@/core/server-only";

import { createHash } from "node:crypto";

import type { TransactionSql } from "postgres";

import type { DatabaseClient } from "@/core/db/client";
import { sqlClient } from "@/core/db/client";
import type { RoomActionProposalKind, StayRange } from "@/core/db/schema";

export const MAX_PROPOSAL_ROOMS = 20;
export const MAX_PROPOSAL_SUMMARY_LENGTH = 500;

export interface PrepareRoomActionProposalInput {
  homeId: string;
  hostId: string;
  runId: string;
  kind: RoomActionProposalKind;
  stay: StayRange;
  roomIds: readonly string[];
  summary: string;
}

export interface PreparedRoomActionProposal {
  proposalId: string;
  kind: RoomActionProposalKind;
  stay: StayRange;
  roomIds: string[];
  summary: string;
  status: "pending";
}

export class RoomProposalConflictError extends Error {}

export class RoomProposalIdempotencyError extends Error {}

export async function prepareRoomActionProposal(
  database: DatabaseClient,
  input: PrepareRoomActionProposalInput,
): Promise<PreparedRoomActionProposal> {
  const normalized = normalizeInput(input);
  const requestHash = proposalRequestHash(normalized);
  const idempotencyKey = `agent-room:${normalized.runId}`;

  return sqlClient(database).begin(async (transaction) => {
    await transaction`
      select pg_advisory_xact_lock(hashtextextended(${normalized.homeId}::text, 0))
    `;
    const [authority] = await transaction<
      { host_id: string; run_id: string }[]
    >`
      select host.id as host_id, run.id as run_id
      from public.hosts host
      join public.runs run on run.id = ${normalized.runId}
        and run.home_id = host.home_id
        and run.task = 'host_room_request'
        and run.payload->>'hostId' = host.id::text
      where host.id = ${normalized.hostId}
        and host.home_id = ${normalized.homeId}
    `;
    if (!authority) {
      throw new RoomProposalConflictError(
        "The host room request is outside its trusted home or run scope",
      );
    }
    const existing = await loadExistingProposal(
      transaction,
      normalized.homeId,
      normalized.runId,
    );
    if (existing) {
      if (
        existing.kind !== normalized.kind ||
        existing.stay_start !== normalized.stay[0] ||
        existing.stay_end !== normalized.stay[1] ||
        existing.summary !== normalized.summary
      ) {
        throw new RoomProposalIdempotencyError(
          "This agent run already prepared a different room proposal",
        );
      }
      return existingProposalResult(existing, normalized, transaction);
    }

    const rooms = await transaction<{ id: string; inventory_state: string }[]>`
      select id, inventory_state from public.rooms
      where home_id = ${normalized.homeId}
        and id in ${transaction(normalized.roomIds)}
      order by id
    `;
    if (rooms.length !== normalized.roomIds.length) {
      throw new RoomProposalConflictError(
        "One or more selected rooms are outside the task home",
      );
    }
    const expectedState = normalized.kind === "open" ? "withheld" : "available";
    if (
      normalized.kind !== "private_block" &&
      rooms.some(({ inventory_state }) => inventory_state !== expectedState)
    ) {
      throw new RoomProposalConflictError(
        `${normalized.kind} is not valid for the selected room inventory state`,
      );
    }
    if (
      normalized.kind === "private_block" &&
      rooms.some(
        ({ inventory_state }) =>
          inventory_state !== "available" && inventory_state !== "withheld",
      )
    ) {
      throw new RoomProposalConflictError(
        "A private block can use only active room inventory",
      );
    }

    const [proposal] = await transaction<{ id: string }[]>`
      insert into public.room_action_proposals (
        home_id, requested_by_host_id, run_id, kind, stay, summary,
        idempotency_key, request_hash
      ) values (
        ${normalized.homeId}, ${normalized.hostId}, ${normalized.runId},
        ${normalized.kind},
        daterange(${normalized.stay[0]}::date, ${normalized.stay[1]}::date, '[)'),
        ${normalized.summary}, ${idempotencyKey}, ${requestHash}
      ) returning id
    `;
    if (!proposal) throw new Error("Failed to prepare the room proposal");
    await transaction`
      insert into public.room_action_proposal_rooms (
        proposal_id, room_id, home_id
      )
      select ${proposal.id}, selected.room_id, ${normalized.homeId}
      from unnest(${transaction.array(normalized.roomIds)}::uuid[]) selected(room_id)
    `;
    return proposalResult(proposal.id, normalized);
  });
}

function normalizeInput(
  input: PrepareRoomActionProposalInput,
): PrepareRoomActionProposalInput & { roomIds: string[]; summary: string } {
  validateStay(input.stay);
  const roomIds = [...new Set(input.roomIds)].sort();
  if (
    roomIds.length === 0 ||
    roomIds.length > MAX_PROPOSAL_ROOMS ||
    roomIds.length !== input.roomIds.length
  ) {
    throw new RangeError(
      `A room proposal requires 1 to ${MAX_PROPOSAL_ROOMS} unique rooms`,
    );
  }
  if (input.kind !== "private_block" && roomIds.length !== 1) {
    throw new RangeError(
      "An availability proposal must select exactly one room",
    );
  }
  const summary = input.summary.trim();
  if (!summary || summary.length > MAX_PROPOSAL_SUMMARY_LENGTH) {
    throw new RangeError(
      `A proposal summary must contain 1 to ${MAX_PROPOSAL_SUMMARY_LENGTH} characters`,
    );
  }
  return { ...input, roomIds, summary };
}

function validateStay(stay: StayRange): void {
  const [start, end] = stay;
  if (!isIsoDate(start) || !isIsoDate(end) || start >= end) {
    throw new RangeError("A room proposal requires a valid half-open stay");
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function proposalRequestHash(input: PrepareRoomActionProposalInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kind: input.kind,
        stay: input.stay,
        roomIds: input.roomIds,
        summary: input.summary,
      }),
    )
    .digest("hex");
}

interface ExistingProposal {
  id: string;
  kind: RoomActionProposalKind;
  stay_start: string;
  stay_end: string;
  summary: string;
  status: "pending" | "applied" | "dismissed";
}

async function loadExistingProposal(
  transaction: TransactionSql,
  homeId: string,
  runId: string,
): Promise<ExistingProposal | undefined> {
  const [proposal] = await transaction<ExistingProposal[]>`
    select id, kind, lower(stay)::text as stay_start,
      upper(stay)::text as stay_end, summary, status
    from public.room_action_proposals
    where home_id = ${homeId} and run_id = ${runId}
    order by created_at, id
    limit 1
  `;
  return proposal;
}

async function existingProposalResult(
  existing: ExistingProposal,
  input: PrepareRoomActionProposalInput & {
    roomIds: string[];
    summary: string;
  },
  transaction: TransactionSql,
): Promise<PreparedRoomActionProposal> {
  if (existing.status !== "pending") {
    throw new RoomProposalIdempotencyError(
      "This agent run's room proposal is no longer pending",
    );
  }
  const rooms = await transaction<{ room_id: string }[]>`
    select room_id from public.room_action_proposal_rooms
    where proposal_id = ${existing.id} and home_id = ${input.homeId}
    order by room_id
  `;
  if (
    JSON.stringify(rooms.map(({ room_id }) => room_id)) !==
    JSON.stringify(input.roomIds)
  ) {
    throw new RoomProposalIdempotencyError(
      "The stored room proposal does not match this agent request",
    );
  }
  return proposalResult(existing.id, input);
}

function proposalResult(
  proposalId: string,
  input: PrepareRoomActionProposalInput & {
    roomIds: string[];
    summary: string;
  },
): PreparedRoomActionProposal {
  return {
    proposalId,
    kind: input.kind,
    stay: input.stay,
    roomIds: input.roomIds,
    summary: input.summary,
    status: "pending",
  };
}
