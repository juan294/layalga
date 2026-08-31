import "@/core/server-only";

import { createHash } from "node:crypto";

import type { TransactionSql } from "postgres";

import { sqlClient, type DatabaseClient } from "@/core/db/client";
import type { RoomAvailabilityAction, StayRange } from "@/core/db/schema";

export class RoomOperationConflictError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RoomOperationConflictError";
  }
}

export class RoomOperationIdempotencyError extends Error {
  constructor() {
    super("The idempotency key was already used for a different request");
    this.name = "RoomOperationIdempotencyError";
  }
}

export interface CreatePrivateRoomBlockInput {
  homeId: string;
  hostId: string;
  roomIds: readonly string[];
  stay: StayRange;
  publicLabel: string;
  privateNote?: string;
  idempotencyKey: string;
}

export interface PrivateRoomBlockResult {
  id: string;
  status: "active" | "cancelled";
  roomIds: string[];
}

export interface CreateRoomOverrideInput {
  homeId: string;
  hostId: string;
  roomId: string;
  stay: StayRange;
  action: RoomAvailabilityAction;
  privateNote?: string;
  idempotencyKey: string;
}

export interface RoomOverrideResult {
  id: string;
  action: RoomAvailabilityAction;
  roomId: string;
}

function requestHash(value: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateStay(stay: StayRange): void {
  const start = Date.parse(`${stay[0]}T00:00:00Z`);
  const end = Date.parse(`${stay[1]}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new RangeError("A room operation requires a valid half-open stay");
  }
}

async function lockHomeAndHost(
  transaction: TransactionSql,
  homeId: string,
  hostId: string,
): Promise<void> {
  const [home] = await transaction<{ id: string }[]>`
    select id from public.homes where id = ${homeId} for update
  `;
  if (!home) throw new Error(`Home not found: ${homeId}`);
  const [host] = await transaction<{ id: string }[]>`
    select id from public.hosts where id = ${hostId} and home_id = ${homeId}
  `;
  if (!host) throw new Error("Host does not belong to the room-operation home");
}

async function audit(
  transaction: TransactionSql,
  homeId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await transaction`
    insert into public.audit_events (home_id, actor, kind, payload)
    values (${homeId}, 'host', ${kind}, ${JSON.stringify(payload)}::text::jsonb)
  `;
}

export async function createPrivateRoomBlock(
  database: DatabaseClient,
  input: CreatePrivateRoomBlockInput,
): Promise<PrivateRoomBlockResult> {
  validateStay(input.stay);
  const roomIds = [...new Set(input.roomIds)].sort();
  if (roomIds.length === 0 || roomIds.length !== input.roomIds.length) {
    throw new RangeError("A private block requires unique room IDs");
  }
  if (!input.publicLabel.trim() || !input.idempotencyKey.trim()) {
    throw new RangeError("A public label and idempotency key are required");
  }
  const hash = requestHash({
    roomIds,
    stay: input.stay,
    publicLabel: input.publicLabel.trim(),
    privateNote: input.privateNote ?? null,
  });

  try {
    return await sqlClient(database).begin(async (transaction) => {
      await lockHomeAndHost(transaction, input.homeId, input.hostId);
      const [existing] = await transaction<
        { id: string; request_hash: string; status: "active" | "cancelled" }[]
      >`
        select id, request_hash, status
        from public.private_room_blocks
        where home_id = ${input.homeId} and idempotency_key = ${input.idempotencyKey}
      `;
      if (existing) {
        if (existing.request_hash !== hash) {
          throw new RoomOperationIdempotencyError();
        }
        const rooms = await transaction<{ room_id: string }[]>`
          select room_id from public.visit_rooms
          where private_block_id = ${existing.id}
          order by room_id
        `;
        return {
          id: existing.id,
          status: existing.status,
          roomIds: rooms.map(({ room_id: id }) => id),
        };
      }

      const rooms = await transaction<{ id: string }[]>`
        select id from public.rooms
        where home_id = ${input.homeId}
          and id in ${transaction(roomIds)}
          and inventory_state in ('available', 'withheld')
        order by id
      `;
      if (rooms.length !== roomIds.length) {
        throw new RoomOperationConflictError(
          "A selected room is outside the home or cannot be blocked",
        );
      }
      const [block] = await transaction<{ id: string }[]>`
        insert into public.private_room_blocks (
          home_id, stay, public_label, private_note, created_by_host_id,
          idempotency_key, request_hash, calendar_eligible_at, calendar_updated_at
        ) values (
          ${input.homeId},
          daterange(${input.stay[0]}::date, ${input.stay[1]}::date, '[)'),
          ${input.publicLabel.trim()}, ${input.privateNote ?? null}, ${input.hostId},
          ${input.idempotencyKey}, ${hash}, now(), now()
        ) returning id
      `;
      if (!block) throw new Error("Failed to create the private room block");
      for (const roomId of roomIds) {
        await transaction`
          insert into public.visit_rooms (private_block_id, room_id, home_id, stay)
          values (
            ${block.id}, ${roomId}, ${input.homeId},
            daterange(${input.stay[0]}::date, ${input.stay[1]}::date, '[)')
          )
        `;
      }
      await audit(transaction, input.homeId, "private_room_block_created", {
        blockId: block.id,
        roomIds,
        stay: input.stay,
      });
      return { id: block.id, status: "active", roomIds };
    });
  } catch (error) {
    if (isPostgresError(error, "23P01")) {
      throw new RoomOperationConflictError(
        "A selected room is already occupied for part of this stay",
        { cause: error },
      );
    }
    throw error;
  }
}

export async function cancelPrivateRoomBlock(
  database: DatabaseClient,
  blockId: string,
  hostId: string,
): Promise<PrivateRoomBlockResult> {
  return sqlClient(database).begin(async (transaction) => {
    const [initial] = await transaction<{ home_id: string }[]>`
      select home_id from public.private_room_blocks where id = ${blockId}
    `;
    if (!initial) throw new Error(`Private room block not found: ${blockId}`);
    await lockHomeAndHost(transaction, initial.home_id, hostId);
    const [block] = await transaction<
      { id: string; status: "active" | "cancelled" }[]
    >`
      select id, status from public.private_room_blocks
      where id = ${blockId} and home_id = ${initial.home_id}
      for update
    `;
    if (!block) throw new Error(`Private room block not found: ${blockId}`);
    const rooms = await transaction<{ room_id: string }[]>`
      select room_id from public.visit_rooms
      where private_block_id = ${blockId}
      order by room_id
    `;
    if (block.status === "active") {
      await transaction`
        delete from public.visit_rooms where private_block_id = ${blockId}
      `;
      await transaction`
        update public.private_room_blocks
        set status = 'cancelled', cancelled_at = now(),
            calendar_updated_at = now(), calendar_sequence = calendar_sequence + 1
        where id = ${blockId}
      `;
      await audit(
        transaction,
        initial.home_id,
        "private_room_block_cancelled",
        {
          blockId,
          roomIds: rooms.map(({ room_id: id }) => id),
        },
      );
    }
    return {
      id: blockId,
      status: "cancelled",
      roomIds: rooms.map(({ room_id: id }) => id),
    };
  });
}

export async function createRoomAvailabilityOverride(
  database: DatabaseClient,
  input: CreateRoomOverrideInput,
): Promise<RoomOverrideResult> {
  validateStay(input.stay);
  if (!input.idempotencyKey.trim()) {
    throw new RangeError("An idempotency key is required");
  }
  const hash = requestHash({
    roomId: input.roomId,
    stay: input.stay,
    action: input.action,
    privateNote: input.privateNote ?? null,
  });

  try {
    return await sqlClient(database).begin(async (transaction) => {
      await lockHomeAndHost(transaction, input.homeId, input.hostId);
      const [existing] = await transaction<
        {
          id: string;
          request_hash: string;
          room_id: string;
          action: RoomAvailabilityAction;
        }[]
      >`
        select id, request_hash, room_id, action
        from public.room_availability_overrides
        where home_id = ${input.homeId} and idempotency_key = ${input.idempotencyKey}
      `;
      if (existing) {
        if (existing.request_hash !== hash) {
          throw new RoomOperationIdempotencyError();
        }
        return {
          id: existing.id,
          roomId: existing.room_id,
          action: existing.action,
        };
      }
      const [room] = await transaction<{ inventory_state: string }[]>`
        select inventory_state from public.rooms
        where id = ${input.roomId} and home_id = ${input.homeId}
      `;
      const expectedState = input.action === "open" ? "withheld" : "available";
      if (room?.inventory_state !== expectedState) {
        throw new RoomOperationConflictError(
          `${input.action} is not valid for this room's inventory state`,
        );
      }
      const [override] = await transaction<{ id: string }[]>`
        insert into public.room_availability_overrides (
          home_id, room_id, stay, action, created_by_host_id,
          idempotency_key, request_hash, private_note
        ) values (
          ${input.homeId}, ${input.roomId},
          daterange(${input.stay[0]}::date, ${input.stay[1]}::date, '[)'),
          ${input.action}, ${input.hostId}, ${input.idempotencyKey}, ${hash},
          ${input.privateNote ?? null}
        ) returning id
      `;
      if (!override) throw new Error("Failed to create the room override");
      await audit(
        transaction,
        input.homeId,
        "room_availability_override_created",
        {
          overrideId: override.id,
          roomId: input.roomId,
          stay: input.stay,
          action: input.action,
        },
      );
      return { id: override.id, roomId: input.roomId, action: input.action };
    });
  } catch (error) {
    if (isPostgresError(error, "23P01")) {
      throw new RoomOperationConflictError(
        "This room already has a date control in the requested range",
        { cause: error },
      );
    }
    throw error;
  }
}

export async function removeRoomAvailabilityOverride(
  database: DatabaseClient,
  overrideId: string,
  hostId: string,
): Promise<void> {
  await sqlClient(database).begin(async (transaction) => {
    const [record] = await transaction<{ home_id: string; room_id: string }[]>`
      select home_id, room_id from public.room_availability_overrides
      where id = ${overrideId}
    `;
    if (!record) return;
    await lockHomeAndHost(transaction, record.home_id, hostId);
    await transaction`
      delete from public.room_availability_overrides
      where id = ${overrideId} and home_id = ${record.home_id}
    `;
    await audit(
      transaction,
      record.home_id,
      "room_availability_override_removed",
      {
        overrideId,
        roomId: record.room_id,
      },
    );
  });
}

function isPostgresError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
