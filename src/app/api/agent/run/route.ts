import { NextResponse } from "next/server";

import { runAgentTask } from "@/agent/run-task";
import { runtimeDeps } from "@/agent/runtime/deps";
import { agentTaskSchema } from "@/agent/task";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.TICK_SECRET;
  if (!secret || request.headers.get("x-layalga-internal") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = agentTaskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid agent task" }, { status: 400 });
  }
  return NextResponse.json(
    await runAgentTask(parsed.data, await runtimeDeps(parsed.data)),
  );
}
