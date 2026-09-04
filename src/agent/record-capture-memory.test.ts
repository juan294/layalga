import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";
import type { MemoryClient } from "@/core/memory/client";

import { NoopScheduler } from "./deps";
import { recordCaptureMemory } from "./record-capture-memory";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("recordCaptureMemory", () => {
  afterAll(() => sql.end());

  const previousMemory = process.env.MEMORY;
  const previousMemoryId = process.env.MEMORY_ID;
  const previousRegion = process.env.AWS_REGION;

  beforeEach(() => {
    process.env.MEMORY = "agentcore";
    process.env.MEMORY_ID = "mem-test";
    process.env.AWS_REGION = "us-east-1";
  });

  afterEach(() => {
    if (previousMemory === undefined) delete process.env.MEMORY;
    else process.env.MEMORY = previousMemory;
    if (previousMemoryId === undefined) delete process.env.MEMORY_ID;
    else process.env.MEMORY_ID = previousMemoryId;
    if (previousRegion === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = previousRegion;
  });

  it("writes a name-free event and a memory_written audit row with no content", async () => {
    const fixture = await seedCapturedInvitation({
      adults: 2,
      children: 1,
      pets: 0,
      flexibleDates: { text: "a weekend in September" },
      arrivalTime: "18:00",
      specialRequests: ["step-free access"],
    });
    const events: { text: string; clientToken: string; actorId: string }[] = [];
    const fakeClient: MemoryClient = {
      createEvent: async (input) => {
        events.push({
          text: input.text,
          clientToken: input.clientToken,
          actorId: input.actorId,
        });
      },
      listMemoryRecords: async () => ({ items: [] }),
      batchDeleteMemoryRecords: async () => undefined,
      listSessions: async () => ({ items: [] }),
      listEvents: async () => ({ items: [] }),
      deleteEvent: async () => undefined,
    };

    try {
      await recordCaptureMemory(
        {
          db: sql,
          clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
          scheduler: new NoopScheduler(),
          appUrl: "http://localhost:3008",
          locale: "en",
        },
        fixture.runId,
        fixture.sessionId,
        fixture.homeId,
        fakeClient,
      );

      expect(events).toHaveLength(1);
      expect(events[0]!.clientToken).toBe(fixture.runId);
      expect(events[0]!.actorId).toBe(
        `home-${fixture.homeId}/party-${fixture.partyId}`,
      );
      expect(events[0]!.text).not.toContain("Vega");
      expect(events[0]!.text).toContain("2 adults");
      expect(events[0]!.text).toContain("a weekend in September");
      expect(events[0]!.text).toContain("step-free access");

      const [audit] = await sql<
        { actor: string; kind: string; payload: unknown }[]
      >`
        select actor, kind, payload from public.audit_events
        where run_id = ${fixture.runId} and kind = 'memory_written'
      `;
      expect(audit).toEqual({
        actor: "agent",
        kind: "memory_written",
        payload: {},
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("does nothing when the run never captured an invitation", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone) values ('No capture', 'Europe/Madrid')
      returning id
    `;
    const [run] = await sql<{ id: string }[]>`
      insert into public.runs (home_id, session_id, task)
      values (${home!.id}, 'capture_none', 'host_capture')
      returning id
    `;
    const fakeClient: MemoryClient = {
      createEvent: async () => {
        throw new Error("createEvent must not be called");
      },
      listMemoryRecords: async () => ({ items: [] }),
      batchDeleteMemoryRecords: async () => undefined,
      listSessions: async () => ({ items: [] }),
      listEvents: async () => ({ items: [] }),
      deleteEvent: async () => undefined,
    };

    try {
      await recordCaptureMemory(
        {
          db: sql,
          clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
          scheduler: new NoopScheduler(),
          appUrl: "http://localhost:3008",
          locale: "en",
        },
        run!.id,
        "capture_none",
        home!.id,
        fakeClient,
      );
      const audits = await sql`
        select 1 from public.audit_events where run_id = ${run!.id}
      `;
      expect(audits).toHaveLength(0);
    } finally {
      await sql`delete from public.homes where id = ${home!.id}`;
    }
  });

  it("does nothing when MEMORY is not agentcore", async () => {
    process.env.MEMORY = "none";
    const fixture = await seedCapturedInvitation({ adults: 1 });
    const fakeClient: MemoryClient = {
      createEvent: async () => {
        throw new Error("createEvent must not be called");
      },
      listMemoryRecords: async () => ({ items: [] }),
      batchDeleteMemoryRecords: async () => undefined,
      listSessions: async () => ({ items: [] }),
      listEvents: async () => ({ items: [] }),
      deleteEvent: async () => undefined,
    };
    try {
      await recordCaptureMemory(
        {
          db: sql,
          clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
          scheduler: new NoopScheduler(),
          appUrl: "http://localhost:3008",
          locale: "en",
        },
        fixture.runId,
        fixture.sessionId,
        fixture.homeId,
        fakeClient,
      );
    } finally {
      await fixture.cleanup();
    }
  });
});

async function seedCapturedInvitation(structured: Record<string, unknown>) {
  const [home] = await sql<{ id: string }[]>`
    insert into public.homes (name, timezone) values ('Capture memory test', 'Europe/Madrid')
    returning id
  `;
  const homeId = home!.id;
  const [host] = await sql<{ id: string }[]>`
    insert into public.hosts (home_id, display_name, locale)
    values (${homeId}, 'Host', 'en') returning id
  `;
  const [party] = await sql<{ id: string }[]>`
    insert into public.parties (home_id, family_name, locale, link_token)
    values (${homeId}, 'Familia Vega', 'en', ${crypto.randomUUID()}) returning id
  `;
  const [invitation] = await sql<{ id: string }[]>`
    insert into public.invitations (
      home_id, host_id, party_id, raw_message, structured
    ) values (
      ${homeId}, ${host!.id}, ${party!.id}, 'Invite the Vega family',
      ${JSON.stringify(structured)}::text::jsonb
    ) returning id
  `;
  const sessionId = `capture_${host!.id}`;
  const [run] = await sql<{ id: string }[]>`
    insert into public.runs (home_id, session_id, task)
    values (${homeId}, ${sessionId}, 'host_capture')
    returning id
  `;
  await sql`
    insert into public.audit_events (home_id, run_id, actor, kind, payload)
    values (
      ${homeId}, ${run!.id}, 'agent', 'tool_call',
      ${JSON.stringify({ name: "capture_invitation", invitationId: invitation!.id })}::text::jsonb
    )
  `;
  return {
    homeId,
    partyId: party!.id,
    invitationId: invitation!.id,
    runId: run!.id,
    sessionId,
    cleanup: async () => {
      await sql`delete from public.homes where id = ${homeId}`;
    },
  };
}
