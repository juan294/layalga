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
export type AgentCoreRequest = AgentTask | ExecuteAgentRunRequest;

/**
 * Keep AgentCore's bundled Zod version out of the application type boundary.
 * The runtime handler accepts unknown input and validates it with the app schema.
 */
export function parseAgentCoreRequest(request: unknown): AgentCoreRequest {
  return request !== null &&
    typeof request === "object" &&
    "operation" in request
    ? executeAgentRunRequestSchema.parse(request)
    : agentTaskSchema.parse(request);
}

export function isExecuteAgentRunRequest(
  request: AgentCoreRequest,
): request is ExecuteAgentRunRequest {
  return "operation" in request;
}
