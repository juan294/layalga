import { randomUUID } from "node:crypto";

import { runAgentTask } from "@/agent/run-task";
import { runtimeDeps } from "@/agent/runtime/deps";
import { agentTaskSchema } from "@/agent/task";

import { isAgentRunRequestAuthorized } from "../internal-auth";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  if (!isAgentRunRequestAuthorized(request)) {
    return errorResponse(401, "UNAUTHORIZED", requestId);
  }

  const body = await request.json().catch(() => undefined);
  if (body === undefined) {
    return errorResponse(400, "INVALID_JSON", requestId);
  }

  const parsed = agentTaskSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "INVALID_AGENT_TASK", requestId);
  }

  try {
    return Response.json(
      await runAgentTask(parsed.data, await runtimeDeps(parsed.data)),
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    console.error("[AGENT_RUN_FAILED]", {
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse(500, "AGENT_RUN_FAILED", requestId);
  }
}

function errorResponse(
  status: number,
  code: string,
  requestId: string,
): Response {
  return Response.json(
    { error: { code }, requestId },
    { status, headers: { "x-request-id": requestId } },
  );
}
