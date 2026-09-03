import { z } from "zod";

import type { ExecutionRuntime } from "./ports";
import { staySchema } from "./schemas";
import {
  MAX_ADULTS,
  MAX_ARRIVAL_TIME_LENGTH,
  MAX_CHILDREN,
  MAX_DECISION_NOTE_LENGTH,
  MAX_GUEST_MESSAGE_LENGTH,
  MAX_GUEST_NOTES_LENGTH,
  MAX_HOST_MESSAGE_LENGTH,
  MAX_PETS,
} from "./task-limits";

const locale = z.enum(["en", "es"]);
export const hostDecisionSchema = z.object({
  approved: z.boolean(),
  hostId: z.uuid(),
  note: z.string().max(MAX_DECISION_NOTE_LENGTH).optional(),
});

export const agentTaskSchema = z.discriminatedUnion("task", [
  z.object({
    task: z.literal("host_capture"),
    homeId: z.uuid(),
    hostId: z.uuid(),
    rawMessage: z.string().min(1).max(MAX_HOST_MESSAGE_LENGTH),
    locale,
  }),
  z.object({
    task: z.literal("host_room_request"),
    homeId: z.uuid(),
    hostId: z.uuid(),
    rawMessage: z.string().min(1).max(MAX_HOST_MESSAGE_LENGTH),
    locale,
  }),
  z.object({
    task: z.literal("guest_submit"),
    homeId: z.uuid(),
    invitationId: z.uuid(),
    stay: staySchema,
    adults: z.int().min(1).max(MAX_ADULTS),
    children: z.int().min(0).max(MAX_CHILDREN),
    pets: z.int().min(0).max(MAX_PETS),
    arrivalTime: z.string().max(MAX_ARRIVAL_TIME_LENGTH).optional(),
    notes: z.string().max(MAX_GUEST_NOTES_LENGTH).optional(),
    roomIds: z.array(z.uuid()).min(1).max(20).optional(),
    overflowConsent: z.boolean().optional(),
    locale,
  }),
  z.object({
    task: z.literal("guest_change"),
    homeId: z.uuid(),
    visitId: z.uuid(),
    message: z.string().min(1).max(MAX_GUEST_MESSAGE_LENGTH),
    locale,
  }),
  z.object({
    task: z.literal("guest_reconfirm"),
    homeId: z.uuid(),
    visitId: z.uuid(),
    answer: z.enum(["yes", "change"]),
    message: z.string().max(MAX_GUEST_MESSAGE_LENGTH).optional(),
  }),
  z.object({
    task: z.literal("resume"),
    homeId: z.uuid(),
    sessionId: z.string().min(1),
    responses: z
      .array(
        z.object({
          interruptId: z.string().min(1),
          response: hostDecisionSchema,
        }),
      )
      .min(1),
  }),
  z.object({
    task: z.literal("tick"),
    homeId: z.uuid(),
    jobId: z.uuid(),
  }),
]);

export type AgentTask = z.infer<typeof agentTaskSchema>;
export type HostDecision = z.infer<typeof hostDecisionSchema>;

export interface RunResult {
  runId: string;
  status: "queued" | "completed" | "interrupted" | "failed";
  sessionId: string;
  pendingDecisionIds: string[];
  summary: string;
  executedOn?: ExecutionRuntime;
}

const executionRuntimeSchema = z.enum(["local", "agentcore"]);

/** The JSON written to `public.runs.result` when a run reaches a terminal state. */
export const storedRunResultSchema = z.object({
  summary: z.string().optional().catch(undefined),
  executedOn: executionRuntimeSchema.optional().catch(undefined),
});

export type StoredRunResult = z.infer<typeof storedRunResultSchema>;

/**
 * Reads a stored run result, unwrapping string-encoded JSON. A plain string
 * that is not JSON is treated as the summary itself.
 */
export function parseStoredRunResult(value: unknown): StoredRunResult {
  if (typeof value === "string") {
    try {
      return parseStoredRunResult(JSON.parse(value));
    } catch {
      return { summary: value };
    }
  }
  const parsed = storedRunResultSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}
