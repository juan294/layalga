import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "./deps";
import { runAgentTask } from "./run-task";
import { ScriptedModel } from "./scripted-model";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("agent request safety", () => {
  afterAll(() => sql.end());

  it("replays one business intent without another model call or run", async () => {
    const fixture = await seedHost();
    const clock = new FakeClock(new Date("2026-09-01T10:01:00Z"));
    const model = new ScriptedModel([{ text: "Invitation recorded." }]);
    const task = hostTask(fixture, "Invite the Vega family next weekend.");
    try {
      const first = await runAgentTask(task, deps(model, clock));
      const replay = await runAgentTask(task, deps(model, clock));

      expect(replay).toEqual(first);
      clock.advance(10 * 60 * 1_000);
      const later = await runAgentTask(
        task,
        deps(new ScriptedModel([{ text: "Invitation recorded again." }]), clock),
      );
      expect(later.runId).not.toBe(first.runId);
      const [count] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.runs
        where home_id = ${fixture.homeId}
      `;
      expect(count?.count).toBe(2);
    } finally {
      await cleanup(fixture);
    }
  });

  it("accepts a later distinct intent but bounds repeated actor cost", async () => {
    const fixture = await seedHost();
    try {
      for (let index = 0; index < 5; index += 1) {
        await runAgentTask(
          hostTask(fixture, `Invite family ${index}.`),
          deps(new ScriptedModel([{ text: `Recorded ${index}.` }])),
        );
      }

      await expect(
        runAgentTask(
          hostTask(fixture, "Invite one family too many."),
          deps(new ScriptedModel([{ text: "Should not run." }])),
        ),
      ).rejects.toThrow("request limit");
      const [count] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.runs
        where home_id = ${fixture.homeId}
      `;
      expect(count?.count).toBe(5);
    } finally {
      await cleanup(fixture);
    }
  });

  it("retries a failed host intent on the same durable run", async () => {
    const fixture = await seedHost();
    const task = hostTask(fixture, "Invite the retry family.");
    try {
      await expect(
        runAgentTask(task, deps(new ScriptedModel([]))),
      ).rejects.toThrow("no step left");
      const [failed] = await sql<
        { id: string; status: string; request_attempt_count: number }[]
      >`
        select id, status, request_attempt_count from public.runs
        where home_id = ${fixture.homeId}
      `;
      expect(failed).toMatchObject({
        status: "failed",
        request_attempt_count: 1,
      });

      const retried = await runAgentTask(
        task,
        deps(new ScriptedModel([{ text: "Invitation recorded on retry." }])),
      );
      expect(retried).toMatchObject({ runId: failed!.id, status: "completed" });
      const [completed] = await sql<
        { status: string; request_attempt_count: number }[]
      >`
        select status, request_attempt_count from public.runs
        where id = ${failed!.id}
      `;
      expect(completed).toEqual({
        status: "completed",
        request_attempt_count: 2,
      });
    } finally {
      await cleanup(fixture);
    }
  });

  it("caps failed interactive retries and never reports them as success", async () => {
    const fixture = await seedHost();
    const task = hostTask(fixture, "Invite the capped retry family.");
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await expect(
          runAgentTask(task, deps(new ScriptedModel([]))),
        ).rejects.toThrow("no step left");
      }

      await expect(
        runAgentTask(
          task,
          deps(new ScriptedModel([{ text: "Must not execute." }])),
        ),
      ).rejects.toThrow("retry limit");
      const [run] = await sql<
        { status: string; request_attempt_count: number }[]
      >`
        select status, request_attempt_count from public.runs
        where home_id = ${fixture.homeId}
      `;
      expect(run).toEqual({ status: "failed", request_attempt_count: 3 });
    } finally {
      await cleanup(fixture);
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
    values (${`Request safety ${randomUUID()}`}, 'Europe/Madrid')
    returning id
  `;
  const [host] = await sql<{ id: string }[]>`
    insert into public.hosts (home_id, display_name, locale)
    values (${home!.id}, 'Host', 'en') returning id
  `;
  return { homeId: home!.id, hostId: host!.id };
}

async function cleanup(fixture: Awaited<ReturnType<typeof seedHost>>) {
  await sql`delete from public.homes where id = ${fixture.homeId}`;
  await sql`delete from public.agent_sessions where session_id = ${`capture_${fixture.hostId}`}`;
}
