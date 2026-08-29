import { z } from "zod";

import { staySchema } from "./schemas";

const locale = z.enum(["en", "es"]);
export const hostDecisionSchema = z.object({
  approved: z.boolean(),
  hostId: z.uuid(),
  note: z.string().optional(),
});

export const agentTaskSchema = z.discriminatedUnion("task", [
  z.object({
    task: z.literal("host_capture"),
    homeId: z.uuid(),
    hostId: z.uuid(),
    rawMessage: z.string().min(1),
    locale,
  }),
  z.object({
    task: z.literal("guest_submit"),
    homeId: z.uuid(),
    invitationId: z.uuid(),
    stay: staySchema,
    adults: z.int().min(1),
    children: z.int().min(0),
    pets: z.int().min(0),
    arrivalTime: z.string().optional(),
    notes: z.string().optional(),
    locale,
  }),
  z.object({
    task: z.literal("guest_change"),
    homeId: z.uuid(),
    visitId: z.uuid(),
    message: z.string().min(1),
    locale,
  }),
  z.object({
    task: z.literal("guest_reconfirm"),
    homeId: z.uuid(),
    visitId: z.uuid(),
    answer: z.enum(["yes", "change"]),
    message: z.string().optional(),
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
  status: "completed" | "interrupted" | "failed";
  sessionId: string;
  pendingDecisionIds: string[];
  summary: string;
}
