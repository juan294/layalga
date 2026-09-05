import { dispatchGuestEmailPingsSafely } from "@/core/notifications/guest-outbox";
import { getAgentClient } from "@/agent/client";
import { drainAgentQueue } from "@/agent/queue";
import { SystemClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import { dispatchHostEmailPingsSafely } from "@/core/notifications/email-outbox";
import { dispatchDueJobs } from "@/core/reconfirmation/jobs";

import { isTickRequestAuthorized } from "./authorization";

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
  const guestEmail = await dispatchGuestEmailPingsSafely(connection.db, clock);
  return Response.json({ jobs, count: jobs.length, queue, guestEmail });
}
