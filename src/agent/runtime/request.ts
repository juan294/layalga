import { agentTaskSchema, type AgentTask } from "../task";

/**
 * Keep AgentCore's bundled Zod version out of the application type boundary.
 * The runtime handler accepts unknown input and validates it with the app schema.
 */
export function parseAgentCoreRequest(request: unknown): AgentTask {
  return agentTaskSchema.parse(request);
}
