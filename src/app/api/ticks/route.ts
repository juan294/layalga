import { getAgentClient } from "@/agent/client";
import { drainAgentQueue } from "@/agent/queue";
import { SystemClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import { dispatchHostEmailPingsSafely } from "@/core/notifications/email-outbox";
import { dispatchDueJobs } from "@/core/reconfirmation/jobs";

import { matchesInternalSecret } from "../agent/internal-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  if (!isTickRequestAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = getDatabaseConnection();
  const clock = new SystemClock();
  const agentClient = getAgentClient();
  const jobs = await dispatchDueJobs(connection.db, clock, {
    enqueue: (task) => agentClient.enqueue(task, { opportunistic: false }),
  });
  const queue = await drainAgentQueue(
    connection.db,
    clock,
    (runId, task) => agentClient.executeQueued(runId, task),
    { concurrency: 2 },
  );
  await dispatchHostEmailPingsSafely(connection.db, clock);
  return Response.json({ jobs, count: jobs.length, queue });
}

export function isTickRequestAuthorized(
  request: Request,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    matchesInternalSecret(
      request.headers.get("x-layalga-internal"),
      env.TICK_SECRET,
    ) ||
    matchesInternalSecret(
      bearerToken(request.headers.get("authorization")),
      env.CRON_SECRET,
    )
  );
}

function bearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
}
