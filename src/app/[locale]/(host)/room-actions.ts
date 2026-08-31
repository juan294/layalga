"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAgentClient } from "@/agent/client";
import { MAX_HOST_MESSAGE_LENGTH } from "@/agent/task-limits";
import { getDatabaseConnection } from "@/core/db/client";
import { MAX_ROOM_SELECTION } from "@/core/rooms/limits";
import {
  applyRoomActionProposal,
  cancelPrivateRoomBlock,
  createPrivateRoomBlock,
  createRoomAvailabilityOverride,
  createRoomInventory,
  dismissRoomActionProposal,
  removeRoomAvailabilityOverride,
  updateRoomInventory,
} from "@/core/rooms/operations";
import { requireHost } from "@/lib/auth/current-host";
import { reportActionError } from "@/lib/server/action-errors";

const localeSchema = z.enum(["en", "es"]);
const inventorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  guestLabel: z.string().trim().min(1).max(120),
  floorLabel: z.string().trim().min(1).max(120),
  sleepingArrangement: z.string().trim().min(1).max(240),
  overflowArrangement: z.string().trim().max(240).optional(),
  standardCapacity: z.coerce.number().int().min(1).max(30),
  maximumCapacity: z.coerce.number().int().min(1).max(30),
  inventoryState: z.enum(["draft", "available", "withheld", "inactive"]),
  overflowPolicy: z.enum(["none", "host_approval"]),
  displayOrder: z.coerce.number().int().min(0).max(10_000),
  privateNotes: z.string().trim().max(2_000).optional(),
});

export async function createRoomInventoryAction(formData: FormData) {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const parsed = inventorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  try {
    await createRoomInventory(getDatabaseConnection().db, {
      homeId: host.homeId,
      hostId: host.id,
      ...parsed.data,
    });
    revalidatePath(`/${locale}`);
  } catch (error) {
    reportActionError("room_inventory_create_failed", error);
  }
}

export async function updateRoomInventoryAction(formData: FormData) {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const parsed = inventorySchema
    .extend({ roomId: z.uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  try {
    await updateRoomInventory(getDatabaseConnection().db, {
      homeId: host.homeId,
      hostId: host.id,
      ...parsed.data,
    });
    revalidatePath(`/${locale}`);
  } catch (error) {
    reportActionError("room_inventory_update_failed", error);
  }
}

export async function createPrivateBlockAction(formData: FormData) {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const parsed = z
    .object({
      from: z.iso.date(),
      to: z.iso.date(),
      publicLabel: z.string().trim().min(1).max(160),
      privateNote: z.string().trim().max(2_000).optional(),
      roomIds: z.array(z.uuid()).min(1).max(MAX_ROOM_SELECTION),
    })
    .safeParse({
      ...Object.fromEntries(formData),
      roomIds: formData.getAll("roomIds").map(String),
    });
  if (!parsed.success || !validStay([parsed.data.from, parsed.data.to])) return;
  try {
    await createPrivateRoomBlock(getDatabaseConnection().db, {
      homeId: host.homeId,
      hostId: host.id,
      roomIds: parsed.data.roomIds,
      stay: [parsed.data.from, parsed.data.to],
      publicLabel: parsed.data.publicLabel,
      privateNote: parsed.data.privateNote,
      idempotencyKey: randomUUID(),
    });
    revalidatePath(`/${locale}`);
  } catch (error) {
    reportActionError("private_room_block_create_failed", error);
  }
}

export async function cancelPrivateBlockAction(formData: FormData) {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const blockId = z.uuid().safeParse(formData.get("blockId"));
  if (!blockId.success) return;
  try {
    await cancelPrivateRoomBlock(
      getDatabaseConnection().db,
      blockId.data,
      host.id,
    );
    revalidatePath(`/${locale}`);
  } catch (error) {
    reportActionError("private_room_block_cancel_failed", error);
  }
}

export async function createRoomOverrideAction(formData: FormData) {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const parsed = z
    .object({
      roomId: z.uuid(),
      from: z.iso.date(),
      to: z.iso.date(),
      action: z.enum(["open", "close"]),
      privateNote: z.string().trim().max(2_000).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success || !validStay([parsed.data.from, parsed.data.to])) return;
  try {
    await createRoomAvailabilityOverride(getDatabaseConnection().db, {
      homeId: host.homeId,
      hostId: host.id,
      roomId: parsed.data.roomId,
      stay: [parsed.data.from, parsed.data.to],
      action: parsed.data.action,
      privateNote: parsed.data.privateNote,
      idempotencyKey: randomUUID(),
    });
    revalidatePath(`/${locale}`);
  } catch (error) {
    reportActionError("room_override_create_failed", error);
  }
}

export async function removeRoomOverrideAction(formData: FormData) {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const overrideId = z.uuid().safeParse(formData.get("overrideId"));
  if (!overrideId.success) return;
  try {
    await removeRoomAvailabilityOverride(
      getDatabaseConnection().db,
      overrideId.data,
      host.id,
    );
    revalidatePath(`/${locale}`);
  } catch (error) {
    reportActionError("room_override_remove_failed", error);
  }
}

export async function applyRoomProposalAction(formData: FormData) {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const proposalId = z.uuid().safeParse(formData.get("proposalId"));
  if (!proposalId.success) return;
  try {
    await applyRoomActionProposal(getDatabaseConnection().db, {
      homeId: host.homeId,
      hostId: host.id,
      proposalId: proposalId.data,
    });
    revalidatePath(`/${locale}`);
  } catch (error) {
    reportActionError("room_proposal_apply_failed", error);
  }
}

export async function dismissRoomProposalAction(formData: FormData) {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const proposalId = z.uuid().safeParse(formData.get("proposalId"));
  if (!proposalId.success) return;
  try {
    await dismissRoomActionProposal(getDatabaseConnection().db, {
      homeId: host.homeId,
      hostId: host.id,
      proposalId: proposalId.data,
    });
    revalidatePath(`/${locale}`);
  } catch (error) {
    reportActionError("room_proposal_dismiss_failed", error);
  }
}

export async function requestRoomProposalAction(formData: FormData) {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const rawMessage = z
    .string()
    .trim()
    .min(1)
    .max(MAX_HOST_MESSAGE_LENGTH)
    .safeParse(formData.get("rawMessage"));
  if (!rawMessage.success) return;

  let runId: string;
  try {
    const run = await getAgentClient().enqueue({
      task: "host_room_request",
      homeId: host.homeId,
      hostId: host.id,
      rawMessage: rawMessage.data,
      locale,
    });
    runId = run.runId;
  } catch (error) {
    reportActionError("room_proposal_request_failed", error);
    return;
  }
  redirect(
    `/${locale}/runs/${runId}/status?returnTo=${encodeURIComponent(`/${locale}`)}`,
  );
}

function localeValue(formData: FormData): "en" | "es" {
  return localeSchema.catch("en").parse(formData.get("locale"));
}

function validStay(stay: readonly [string, string]): boolean {
  return stay[0] < stay[1];
}
