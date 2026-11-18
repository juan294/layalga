import { randomUUID } from "node:crypto";
import { seedHost, cleanupHost } from "../testing/seed-host";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";
import { runDueJobs, type AgentInvoker } from "@/core/reconfirmation/jobs";
import { seedDueChaseJob } from "@/agent/testing/seed-due-chase-job";

import {
  handleAgentCoreRequest,
  type AgentCoreLog,
  type AsyncTaskRegistry,
} from "./handler";
import { localRuntimeDeps } from "./local-deps";

// Regression coverage for a claim-order bug: runDueJobs (the minute tick's
// production caller) claims a scheduled job before it invokes the
// agent. A bare {task:"tick"} request must execute the task directly and
// must never re-claim the job through runJob, or it finds the job already
// running, skips execution, and the caller's delivery check fails.

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false });

const silentLog: AgentCoreLog = {
  info: () => {},
  error: () => {},
};

function silentRegistry(): AsyncTaskRegistry {
  return { addAsyncTask: () => 1, completeAsyncTask: () => {} };
}

function trackingRegistry(): {
  registry: AsyncTaskRegistry;
  completed: Promise<void>;
} {
  let resolveCompleted!: () => void;
  const completed = new Promise<void>((resolve) => {
    resolveCompleted = resolve;
  });
  let nextId = 1;
  return {
    registry: {
      addAsyncTask: () => nextId++,
      completeAsyncTask: () => resolveCompleted(),
    },
    completed,
  };
}

describe("handleAgentCoreRequest", () => {
  afterAll(() => sql.end());

  it("captures for the selected returning party when the wording names a different family", async () => {
    const fixture = await seedHost(sql, `Returning handler ${randomUUID()}`);
    try {
      const [party] = await sql<{ id: string }[]>`insert into public.parties
        (home_id, family_name, locale) values (${fixture.homeId}, 'Chosen family', 'es') returning id`;
      const task = {
        task: "host_capture_v2",
        ...fixture,
        captureId: randomUUID(),
        partyChoice: { kind: "returning", partyId: party!.id },
        rawMessage: "Invite the Parkers for a weekend",
        locale: "en",
      };
      const result = await handleAgentCoreRequest(
        task,
        silentLog,
        silentRegistry(),
        localRuntimeDeps,
      );
      expect(result).toMatchObject({
        status: "completed",
        executedOn: "agentcore",
      });
      const rows =
        await sql`select p.id, p.family_name from public.invitations i join public.parties p on p.id = i.party_id where i.home_id = ${fixture.homeId}`;
      expect(rows).toEqual([{ id: party!.id, family_name: "Chosen family" }]);
    } finally {
      await cleanupHost(sql, fixture);
    }
  });

  it("executes a bare tick task directly instead of re-claiming through runJob", async () => {
    const now = new Date();
    const fixture = await seedDueChaseJob(sql, { now });
    try {
      const clock = new FakeClock(now);
      let capturedResult: unknown;
      const invoker: AgentInvoker = {
        async run(tickTask) {
          const result = await handleAgentCoreRequest(
            tickTask,
            silentLog,
            silentRegistry(),
            localRuntimeDeps,
          );
          capturedResult = result;
          return result;
        },
      };

      // Mirrors production: runDueJobs (executeClaimedJob) claims the job
      // before calling the invoker -- the same order the demo clock route
      // and the cron path exercise via AgentCoreClient.run.
      const results = await runDueJobs(sql, clock, invoker, fixture.homeId);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        jobId: fixture.jobId,
        action: "chase",
        status: "done",
      });
      expect(capturedResult).toMatchObject({
        status: "completed",
        executedOn: "agentcore",
      });

      const runId = (capturedResult as { runId: string }).runId;
      const [runRow] = await sql<{ result: unknown }[]>`
        select result from public.runs where id = ${runId}
      `;
      expect(runRow?.result).toMatchObject({ executedOn: "agentcore" });
    } finally {
      await sql`delete from public.homes where id = ${fixture.homeId}`;
    }
  });

  it("accepts a scheduled_tick envelope immediately and completes the job in the background", async () => {
    const now = new Date();
    const fixture = await seedDueChaseJob(sql, { now });
    try {
      const { registry, completed } = trackingRegistry();

      const response = await handleAgentCoreRequest(
        {
          operation: "scheduled_tick",
          homeId: fixture.homeId,
          jobId: fixture.jobId,
        },
        silentLog,
        registry,
        localRuntimeDeps,
      );

      expect(response).toEqual({ status: "accepted", jobId: fixture.jobId });

      await completed;
      const [job] = await sql<{ status: string }[]>`
        select status from public.scheduled_jobs where id = ${fixture.jobId}
      `;
      expect(job?.status).toBe("done");
    } finally {
      await sql`delete from public.homes where id = ${fixture.homeId}`;
    }
  });
});
