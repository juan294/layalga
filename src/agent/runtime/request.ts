import { z } from "zod";

import { agentTaskSchema, type AgentTask } from "../task";

export const executeAgentRunRequestSchema = z.object({
  operation: z.literal("execute_run"),
  runId: z.uuid(),
  task: agentTaskSchema,
});

export type ExecuteAgentRunRequest = z.infer<
  typeof executeAgentRunRequestSchema
>;

export const scheduledTickRequestSchema = z.object({
  operation: z.literal("scheduled_tick"),
  homeId: z.uuid(),
  jobId: z.uuid(),
});

export type ScheduledTickRequest = z.infer<typeof scheduledTickRequestSchema>;

const agentCoreEnvelopeSchema = z.discriminatedUnion("operation", [
  executeAgentRunRequestSchema,
  scheduledTickRequestSchema,
]);

export type AgentCoreRequest =
  AgentTask | ExecuteAgentRunRequest | ScheduledTickRequest;

/**
 * Keep AgentCore's bundled Zod version out of the application type boundary.
 * The runtime handler accepts unknown input and validates it with the app schema.
 */
export function parseAgentCoreRequest(request: unknown): AgentCoreRequest {
  return request !== null &&
    typeof request === "object" &&
    "operation" in request
    ? agentCoreEnvelopeSchema.parse(request)
    : agentTaskSchema.parse(request);
}
