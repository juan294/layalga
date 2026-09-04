import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "./deps";
import { installMemorySearchAudit } from "./memory";
import type { AgentDeps } from "./ports";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

/** Captures the callback `agent.addHook` registers, without a real Agent. */
class FakeAgent {
  callback?: (event: unknown) => Promise<void>;
  addHook(_eventClass: unknown, callback: (event: unknown) => Promise<void>) {
    this.callback = callback;
  }
}

function deps(homeId?: string): AgentDeps {
  return {
    db: sql,
    clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
    scheduler: new NoopScheduler(),
    appUrl: "http://localhost:3008",
    locale: "en",
    authority: homeId ? { homeId } : undefined,
  };
}

describe("installMemorySearchAudit", () => {
  afterAll(() => sql.end());

  it("writes a tool_call audit row for a successful search_memory call", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone) values ('Memory audit test', 'Europe/Madrid')
      returning id
    `;
    const homeId = home!.id;
    try {
      const agent = new FakeAgent();
      installMemorySearchAudit(agent as never, deps(homeId));
      await agent.callback!({
        toolUse: { name: "search_memory" },
        error: undefined,
        invocationState: {},
      });

      const [audit] = await sql<{ kind: string; payload: unknown }[]>`
        select kind, payload from public.audit_events
        where home_id = ${homeId} and kind = 'tool_call'
      `;
      expect(audit).toEqual({
        kind: "tool_call",
        payload: { name: "search_memory" },
      });
    } finally {
      await sql`delete from public.homes where id = ${homeId}`;
    }
  });

  it("ignores any tool call other than search_memory", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone) values ('Memory audit other tool', 'Europe/Madrid')
      returning id
    `;
    const homeId = home!.id;
    try {
      const agent = new FakeAgent();
      installMemorySearchAudit(agent as never, deps(homeId));
      await agent.callback!({
        toolUse: { name: "capture_invitation" },
        error: undefined,
        invocationState: {},
      });

      const audits = await sql`
        select 1 from public.audit_events where home_id = ${homeId}
      `;
      expect(audits).toHaveLength(0);
    } finally {
      await sql`delete from public.homes where id = ${homeId}`;
    }
  });

  it("ignores a failed search_memory call", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone) values ('Memory audit error', 'Europe/Madrid')
      returning id
    `;
    const homeId = home!.id;
    try {
      const agent = new FakeAgent();
      installMemorySearchAudit(agent as never, deps(homeId));
      await agent.callback!({
        toolUse: { name: "search_memory" },
        error: new Error("search failed"),
        invocationState: {},
      });

      const audits = await sql`
        select 1 from public.audit_events where home_id = ${homeId}
      `;
      expect(audits).toHaveLength(0);
    } finally {
      await sql`delete from public.homes where id = ${homeId}`;
    }
  });

  it("does nothing without home authority", async () => {
    const agent = new FakeAgent();
    installMemorySearchAudit(agent as never, deps(undefined));
    await expect(
      agent.callback!({
        toolUse: { name: "search_memory" },
        error: undefined,
        invocationState: {},
      }),
    ).resolves.toBeUndefined();
  });
});
