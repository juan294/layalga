import { randomUUID } from "node:crypto";

import {
  Model,
  type BaseModelConfig,
  type Message,
  type ModelStreamEvent,
  type StreamOptions,
} from "@strands-agents/sdk";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "./deps";
import {
  drainAgentQueue,
  enqueueAgentTask,
  executeQueuedAgentRun,
} from "./queue";
import { runAgentTask } from "./run-task";
import { ScriptedModel } from "./scripted-model";
import type { AgentTask } from "./task";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false });

/**
 * Wraps a `ScriptedModel`, holding its first `stream()` call open until an
 * external gate resolves. Lets a test start a synchronous `runAgentTask`
 * call, observe the run mid-flight (row already inserted, model not yet
 * "responded"), run something concurrently against it, and only then let
 * the run finish -- the shape of the production race (`runAgentTask` vs.
 * the queue drain) without depending on real wall-clock timing.
 */
class GatedModel extends Model<BaseModelConfig> {
  constructor(
    private readonly inner: ScriptedModel,
    private readonly gate: Promise<void>,
  ) {
    super();
  }

  updateConfig(config: Partial<BaseModelConfig>): void {
    this.inner.updateConfig(config);
  }

  getConfig(): BaseModelConfig {
    return this.inner.getConfig();
  }

  async *stream(
    messages: Message[],
    options?: StreamOptions,
  ): AsyncIterable<ModelStreamEvent> {
    await this.gate;
    yield* this.inner.stream(messages, options);
  }
}

/** Polls until a run row for this home reaches `status`, or times out. */
async function waitForRunStatus(
  homeId: string,
  status: string,
  timeoutMs = 2_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const [run] = await sql<{ id: string }[]>`
      select id from public.runs where home_id = ${homeId} and status = ${status}
    `;
    if (run) return run.id;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No run reached status "${status}" for home ${homeId}`);
}

describe("durable agent queue", () => {
  afterAll(() => sql.end());

  it("is never visible to the drain after runAgentTask starts it (sync-claim race)", async () => {
    const fixture = await seedHost();
    const clock = new FakeClock(new Date("2026-09-01T10:00:00Z"));
    try {
      const completed = await runAgentTask(
        hostTask(fixture, "Invite the Vega family."),
        deps(new ScriptedModel([{ text: "Invitation recorded." }]), clock),
      );
      expect(completed.status).toBe("completed");

      const drained = await drainAgentQueue(sql, clock, (runId) =>
        executeQueuedAgentRun(
          runId,
          deps(new ScriptedModel([{ text: "Must not run." }]), clock),
        ),
      );

      expect(drained.claimedRunIds).not.toContain(completed.runId);
      const [row] = await sql<{ status: string }[]>`
        select status from public.runs where id = ${completed.runId}
      `;
      expect(row?.status).toBe("completed");
    } finally {
      await cleanup(fixture.homeId);
    }
  });

  it("runs a synchronous call to completion, undisturbed, while the drain finds nothing to claim (sync-claim race)", async () => {
    const fixture = await seedHost();
    const clock = new FakeClock(new Date("2026-09-01T10:00:00Z"));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gatedModel = new GatedModel(
      new ScriptedModel([{ text: "Invitation recorded." }]),
      gate,
    );

    try {
      const runPromise = runAgentTask(
        hostTask(fixture, "Invite the Vega family, slowly."),
        deps(gatedModel, clock),
      );

      // Wait for the row to land -- it must already be `running` (never
      // observably `queued`), which is the fix itself: before it, this
      // synchronous call still inserted `queued` first, so a drain landing
      // in this exact window would have claimed it.
      const runId = await waitForRunStatus(fixture.homeId, "running");

      const drained = await drainAgentQueue(sql, clock, (candidateId) =>
        executeQueuedAgentRun(
          candidateId,
          deps(new ScriptedModel([{ text: "Must not run." }]), clock),
        ),
      );
      expect(drained.claimedRunIds).toEqual([]);

      // The model is still gated: the run has not finished yet, and the
      // drain must not have touched or failed it.
      const [midFlight] = await sql<{ status: string }[]>`
        select status from public.runs where id = ${runId}
      `;
      expect(midFlight?.status).toBe("running");

      release();
      const result = await runPromise;

      // The bug produced "Agent run is no longer active" here, because the
      // drain had already claimed and dispatched the row out from under
      // this synchronous call's own final write.
      expect(result).toMatchObject({ runId, status: "completed" });
      const [finished] = await sql<{ status: string }[]>`
        select status from public.runs where id = ${runId}
      `;
      expect(finished?.status).toBe("completed");
    } finally {
      await cleanup(fixture.homeId);
    }
  });

  it("finds nothing to claim for a runAgentTask run under sustained concurrent draining (sync-claim race)", async () => {
    const fixture = await seedHost();
    const clock = new FakeClock(new Date("2026-09-01T10:00:00Z"));
    try {
      // Drains back-to-back, as fast as it can, for this call's entire
      // lifetime -- defense in depth alongside the gated-model race above:
      // the run must never be a legitimate drain target at any point this
      // tight loop can observe, not just while genuinely long-running.
      let racing = true;
      let everClaimed = false;
      const racer = (async () => {
        while (racing) {
          const drained = await drainAgentQueue(sql, clock, (runId) =>
            executeQueuedAgentRun(
              runId,
              deps(new ScriptedModel([{ text: "Must not run." }]), clock),
            ),
          );
          if (drained.claimedRunIds.length > 0) everClaimed = true;
        }
      })();

      const result = await runAgentTask(
        hostTask(fixture, "Invite the Vega family."),
        deps(new ScriptedModel([{ text: "Invitation recorded." }]), clock),
      );
      racing = false;
      await racer;

      expect(everClaimed).toBe(false);
      expect(result.status).toBe("completed");
    } finally {
      await cleanup(fixture.homeId);
    }
  });

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
          executedOn: "local",
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
  model: Model<BaseModelConfig>,
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
