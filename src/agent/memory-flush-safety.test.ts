import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import { FakeClock } from "@/core/clock";

// A throwing MemoryManager.flush() must never fail the run it rides along
// with (the review's blocking item 1). Faked here at the `buildAgent`
// boundary -- never a real AgentCore Memory call -- so the failure is
// deterministic and the test never depends on AWS reachability.
vi.mock("./agent", () => ({
  buildAgent: () => ({
    invoke: async () => ({
      stopReason: "end_turn",
      interrupts: [],
      toString: () => "Invitation recorded.",
    }),
    memoryManager: {
      flush: async () => {
        throw new Error("simulated flush failure");
      },
    },
  }),
}));

import { NoopScheduler } from "./deps";
import { runAgentTask } from "./run-task";
import { ScriptedModel } from "./scripted-model";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("memory write safety: flush", () => {
  afterAll(() => sql.end());

  it("still yields a completed run when the memory manager's flush throws", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone) values ('Flush safety', 'Europe/Madrid')
      returning id
    `;
    const [host] = await sql<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home!.id}, 'Host', 'en') returning id
    `;
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });

    try {
      const result = await runAgentTask(
        {
          task: "host_capture",
          homeId: home!.id,
          hostId: host!.id,
          rawMessage: "Invite the Vega family for a weekend.",
          locale: "en",
        },
        {
          db: sql,
          clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
          scheduler: new NoopScheduler(),
          appUrl: "http://localhost:3008",
          locale: "en",
          model: new ScriptedModel([]),
        },
      );

      expect(result.status).toBe("completed");
      const [stored] = await sql<{ status: string }[]>`
        select status from public.runs where id = ${result.runId}
      `;
      expect(stored?.status).toBe("completed");

      const logged = errors.find(([tag]) => tag === "[MEMORY_WRITE_FAILED]");
      expect(logged).toBeDefined();
      expect(logged?.[1]).toMatchObject({
        runId: result.runId,
        stage: "flush",
        errorName: "Error",
      });
      expect(JSON.stringify(logged)).not.toContain("simulated flush failure");
    } finally {
      spy.mockRestore();
      await sql`delete from public.homes where id = ${home!.id}`;
      await sql`delete from public.agent_sessions where session_id = ${`capture_${host!.id}`}`;
    }
  });
});
