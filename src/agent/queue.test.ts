import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "./deps";
import {
  drainAgentQueue,
  enqueueAgentTask,
  executeQueuedAgentRun,
} from "./queue";
import { ScriptedModel } from "./scripted-model";
import type { AgentTask } from "./task";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false });

describe("durable agent queue", () => {
  afterAll(() => sql.end());

  it("persists a validated task and returns its run before model execution", async () => {
    const fixture = await seedHost();
    const model = new ScriptedModel([{ text: "Invitation recorded." }]);
    try {
      const queued = await enqueueAgentTask(
        hostTask(fixture, "Invite the Vega family."),
        deps(model),
      );

      expect(queued).toMatchObject({
        status: "queued",
        pendingDecisionIds: [],
        summary: "Your request is queued.",
      });
      const [stored] = await sql<
        {
          status: string;
          execution_attempt_count: number;
          payload: AgentTask;
        }[]
      >`
        select status, execution_attempt_count, payload
        from public.runs where id = ${queued.runId}
      `;
      expect(stored).toMatchObject({
        status: "queued",
        execution_attempt_count: 0,
        payload: expect.objectContaining({
          task: "host_capture",
          homeId: fixture.homeId,
          hostId: fixture.hostId,
        }),
      });

      const completed = await executeQueuedAgentRun(queued.runId, deps(model));
      expect(completed).toMatchObject({
        runId: queued.runId,
        status: "completed",
      });
    } finally {
      await cleanup(fixture.homeId);
    }
  });

  it("rechecks tenant authority before executing persisted input", async () => {
    const fixture = await seedHost();
    try {
      const queued = await enqueueAgentTask(
        hostTask(fixture, "Invite a family."),
        deps(new ScriptedModel([{ text: "Must not run." }])),
      );
      await sql`delete from public.hosts where id = ${fixture.hostId}`;

      await expect(
        executeQueuedAgentRun(
          queued.runId,
          deps(new ScriptedModel([{ text: "Must not run." }])),
        ),
      ).rejects.toThrow("Host does not belong");
      const [failed] = await sql<
        { status: string; result: { code: string; summary: string } }[]
      >`
        select status, result from public.runs where id = ${queued.runId}
      `;
      expect(failed).toEqual({
        status: "failed",
        result: {
          code: "agent_execution_failed",
          summary: "The agent could not complete this request.",
        },
      });
    } finally {
      await cleanup(fixture.homeId);
    }
  });

  it("claims queued and expired work once with bounded concurrency", async () => {
    const fixture = await seedHost();
    const clock = new FakeClock(new Date("2026-09-01T10:00:00Z"));
    try {
      const first = await enqueueAgentTask(
        hostTask(fixture, "Invite family one."),
        deps(new ScriptedModel([]), clock),
      );
      const second = await enqueueAgentTask(
        hostTask(fixture, "Invite family two."),
        deps(new ScriptedModel([]), clock),
      );
      await sql`
        update public.runs
        set status = 'running', queue_claimed_at = ${new Date(
          clock.now().getTime() - 11 * 60 * 1_000,
        ).toISOString()}, queue_claim_token = ${randomUUID()}
        where id = ${first.runId}
      `;

      const drained = await drainAgentQueue(
        sql,
        clock,
        (runId, task) =>
          executeQueuedAgentRun(
            runId,
            deps(
              new ScriptedModel([{ text: `Completed ${task.task}.` }]),
              clock,
            ),
          ),
        { concurrency: 2 },
      );

      expect(drained.claimedRunIds.sort()).toEqual(
        [first.runId, second.runId].sort(),
      );
      expect(drained.completed).toBe(2);
      expect(drained.failed).toBe(0);
      const rows = await sql<{ id: string; status: string }[]>`
        select id, status from public.runs
        where id in (${first.runId}, ${second.runId})
        order by id
      `;
      expect(rows.every(({ status }) => status === "completed")).toBe(true);
    } finally {
      await cleanup(fixture.homeId);
    }
  });

  it("does not reclaim a live rollout lease before its deadline", async () => {
    const fixture = await seedHost();
    const clock = new FakeClock(new Date("2026-09-01T10:00:00Z"));
    try {
      const queued = await enqueueAgentTask(
        hostTask(fixture, "Invite the rollout family."),
        deps(new ScriptedModel([]), clock),
      );
      await sql`
        update public.runs
        set status = 'running', queue_claimed_at = ${clock.now().toISOString()},
          queue_claim_token = ${randomUUID()}, execution_attempt_count = 1,
          heartbeat_at = ${clock.now().toISOString()},
          deadline_at = ${new Date(
            clock.now().getTime() + 4 * 60 * 1_000,
          ).toISOString()}
        where id = ${queued.runId}
      `;

      const drained = await drainAgentQueue(sql, clock, (runId) =>
        executeQueuedAgentRun(
          runId,
          deps(new ScriptedModel([{ text: "Too early." }]), clock),
        ),
      );
      expect(drained.claimedRunIds).toEqual([]);
      const [run] = await sql<
        { status: string; execution_attempt_count: number }[]
      >`
        select status, execution_attempt_count
        from public.runs where id = ${queued.runId}
      `;
      expect(run).toEqual({ status: "running", execution_attempt_count: 1 });
    } finally {
      await cleanup(fixture.homeId);
    }
  });
});

function deps(
  model: ScriptedModel,
  clock = new FakeClock(new Date("2026-09-01T10:00:00Z")),
) {
  return {
    db: sql,
    clock,
    scheduler: new NoopScheduler(),
    appUrl: "http://localhost:3008",
    locale: "en" as const,
    model,
  };
}

function hostTask(
  fixture: Awaited<ReturnType<typeof seedHost>>,
  rawMessage: string,
) {
  return {
    task: "host_capture" as const,
    homeId: fixture.homeId,
    hostId: fixture.hostId,
    rawMessage,
    locale: "en" as const,
  };
}

async function seedHost() {
  const [home] = await sql<{ id: string }[]>`
    insert into public.homes (name, timezone)
    values (${`Queue ${randomUUID()}`}, 'Europe/Madrid')
    returning id
  `;
  const [host] = await sql<{ id: string }[]>`
    insert into public.hosts (home_id, display_name, locale)
    values (${home!.id}, 'Host', 'en') returning id
  `;
  return { homeId: home!.id, hostId: host!.id };
}

async function cleanup(homeId: string) {
  await sql`delete from public.homes where id = ${homeId}`;
}
