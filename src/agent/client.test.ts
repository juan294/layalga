import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import { FakeClock } from "@/core/clock";
import { runDueJobs } from "@/core/reconfirmation/jobs";
import { seedDueChaseJob } from "@/agent/testing/seed-due-chase-job";

import type { RunAgentDeps } from "./run-task";
import type { AgentTask } from "./task";
import { AgentCoreClient } from "./client";

const task: AgentTask = {
  task: "tick",
  homeId: "11111111-1111-4111-8111-111111111111",
  jobId: "22222222-2222-4222-8222-222222222222",
};
const runId = "33333333-3333-4333-8333-333333333333";

describe("AgentCoreClient", () => {
  it("resolves a bare tick task to the terminal RunResult AgentCore returns", async () => {
    const runResult = {
      runId,
      status: "completed" as const,
      sessionId: `tick_${task.jobId}`,
      pendingDecisionIds: [],
      summary: "Tick complete.",
      executedOn: "agentcore" as const,
    };
    const invoke = vi.fn(async () => runResult);
    const client = new AgentCoreClient("runtime", "eu-west-1", { invoke });

    await expect(client.run(task)).resolves.toEqual(runResult);
    expect(invoke).toHaveBeenCalledWith(task);
  });
});

describe("AgentCoreClient durable queue", () => {
  it("persists once and dispatches the same run ID", async () => {
    const persist = vi.fn(async () => ({
      runId,
      status: "queued" as const,
      sessionId: "session",
      pendingDecisionIds: [],
      summary: "Your request is queued.",
    }));
    const invoke = vi.fn(async () => ({ status: "accepted", runId }));
    const client = new AgentCoreClient("runtime", "eu-west-1", {
      invoke,
      depsForTask: async () => ({}) as RunAgentDeps,
      persist,
    });

    const result = await client.enqueue(task);

    expect(result).toMatchObject({ status: "queued", runId });
    expect(persist).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith({
      operation: "execute_run",
      runId,
      task,
    });
  });

  it("recovers an existing run without persisting a second run", async () => {
    const persist = vi.fn();
    const invoke = vi.fn(async () => ({ status: "accepted", runId }));
    const client = new AgentCoreClient("runtime", "eu-west-1", {
      invoke,
      depsForTask: async () => ({}) as RunAgentDeps,
      persist,
    });

    await expect(client.executeQueued(runId, task)).resolves.toEqual({
      status: "accepted",
      runId,
    });
    expect(persist).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith({
      operation: "execute_run",
      runId,
      task,
    });
  });

  it("lets cron persist without dispatch before its bounded drain", async () => {
    const persist = vi.fn(async () => ({
      runId,
      status: "queued" as const,
      sessionId: "session",
      pendingDecisionIds: [],
      summary: "Your request is queued.",
    }));
    const invoke = vi.fn(async () => ({ status: "accepted", runId }));
    const client = new AgentCoreClient("runtime", "eu-west-1", {
      invoke,
      depsForTask: async () => ({}) as RunAgentDeps,
      persist,
    });

    await client.enqueue(task, { opportunistic: false });
    expect(invoke).not.toHaveBeenCalled();

    await client.executeQueued(runId, task);
    expect(persist).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledOnce();
  });
});

// Demo clock notifications flow through runDueJobs against a real database.
// Mocking the demo clock route's sql tagged templates end to end proved
// brittle, so this exercises the same call the route makes -- runDueJobs
// driven by an AgentCoreClient -- against a seeded due job instead. See the
// phase-0 report for this deviation.
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false });

describe("AgentCoreClient driving runDueJobs", () => {
  afterAll(() => sql.end());

  it("invokes the AgentCore tick once and completes the due job", async () => {
    const now = new Date();
    const fixture = await seedDueChaseJob(sql, { now });
    try {
      const clock = new FakeClock(now);
      const invoke = vi.fn(async (request: unknown) => {
        const payload = request as { homeId: string; jobId: string };
        await sql`
          insert into public.notifications (
            home_id, scheduled_job_id, recipient_kind, recipient_id, visit_id,
            kind, body_en, body_es
          ) values (
            ${payload.homeId}, ${payload.jobId}, 'party', ${fixture.partyId},
            ${fixture.visitId}, 'reconfirm_chase', 'Please reconfirm.',
            'Por favor confirme.'
          )
        `;
        return {
          runId: randomUUID(),
          status: "completed" as const,
          sessionId: `tick_${payload.jobId}`,
          pendingDecisionIds: [],
          summary: "Reconfirmation requested.",
          executedOn: "agentcore" as const,
        };
      });
      const client = new AgentCoreClient("runtime", "us-east-1", { invoke });

      const results = await runDueJobs(sql, clock, client, fixture.homeId);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        jobId: fixture.jobId,
        action: "chase",
        status: "done",
      });
      expect(invoke).toHaveBeenCalledOnce();
      expect(invoke).toHaveBeenCalledWith({
        task: "tick",
        homeId: fixture.homeId,
        jobId: fixture.jobId,
      });
    } finally {
      await sql`delete from public.homes where id = ${fixture.homeId}`;
    }
  });
});
