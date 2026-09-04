import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MemoryClient, Page } from "@/core/memory/client";
import { DEMO_SEED } from "@/lib/demo/reset";

import { seedMemory } from "./seed-memory";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("seedMemory", () => {
  afterAll(() => sql.end());

  const previousMemoryId = process.env.MEMORY_ID;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.MEMORY_ID = "mem-test";
    process.env.DATABASE_URL = url;
  });

  afterEach(() => {
    if (previousMemoryId === undefined) delete process.env.MEMORY_ID;
    else process.env.MEMORY_ID = previousMemoryId;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("writes three name-free events for the seeded Vega party and waits for extraction", async () => {
    const expectedActorId = `home-${DEMO_SEED.home.id}/party-${DEMO_SEED.parties[0].id}`;
    const events: { actorId: string; sessionId: string; text: string }[] = [];
    const fakeClient: MemoryClient = {
      createEvent: async (input) => {
        events.push({
          actorId: input.actorId,
          sessionId: input.sessionId,
          text: input.text,
        });
      },
      listMemoryRecords: async () => ({
        items: [
          { memoryRecordId: "record-1", text: "a fact", createdAt: new Date() },
        ],
      }),
      batchDeleteMemoryRecords: async () => undefined,
      listSessions: async () => ({ items: [] }),
      listEvents: async () => ({ items: [] }),
      deleteEvent: async () => undefined,
    };

    await seedMemory({}, fakeClient);

    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event.actorId).toBe(expectedActorId);
      expect(event.text).not.toContain("Vega");
    }
    expect(new Set(events.map((event) => event.text)).size).toBe(3);
  });

  it("forget-then-seed clears every prior record and event, leaving only the three seeded facts", async () => {
    const [existingHome] = await sql<{ id: string }[]>`
      select id from public.homes where id = ${DEMO_SEED.home.id}
    `;
    const [existingParty] = await sql<{ id: string }[]>`
      select id from public.parties where id = ${DEMO_SEED.parties[0].id}
    `;
    const createdHome = !existingHome;
    const createdParty = !existingParty;
    if (createdHome) {
      await sql`
        insert into public.homes (id, name, timezone)
        values (${DEMO_SEED.home.id}, 'Seed memory round trip', 'Europe/Madrid')
      `;
    }
    if (createdParty) {
      await sql`
        insert into public.parties (id, home_id, family_name, locale, link_token)
        values (
          ${DEMO_SEED.parties[0].id}, ${DEMO_SEED.home.id}, 'Familia Vega', 'es',
          ${crypto.randomUUID()}
        )
      `;
    }

    // A stateful fake standing in for both strategy namespaces and every
    // session an actor could have events under (a leftover guest session
    // and the deterministic host_capture write, alongside this script's
    // own seeded session), so forget-then-seed can be proven end to end
    // through the client calls rather than assumed.
    let recordStore = [
      {
        memoryRecordId: "leftover-pref",
        text: "stale preference",
        createdAt: new Date(),
      },
      {
        memoryRecordId: "leftover-fact",
        text: "stale fact",
        createdAt: new Date(),
      },
    ];
    const eventsBySession: Record<string, string[]> = {
      "inv_leftover-guest-session": ["event-guest-1"],
      "capture_leftover-host": ["event-capture-1"],
    };
    const createEventCalls: { text: string; clientToken: string }[] = [];

    const fakeClient: MemoryClient = {
      createEvent: async (input) => {
        createEventCalls.push({
          text: input.text,
          clientToken: input.clientToken,
        });
        // Simulates extraction: `waitForExtraction` polls listMemoryRecords
        // until at least one record exists, so the fake produces one
        // immediately rather than making the test wait out a real
        // (unmockable) AWS extraction delay.
        recordStore = [
          ...recordStore,
          {
            memoryRecordId: `record-for-${input.clientToken}`,
            text: input.text,
            createdAt: new Date(),
          },
        ];
      },
      listMemoryRecords: async () => ({
        items: recordStore,
        nextToken: undefined,
      }),
      batchDeleteMemoryRecords: async ({ memoryRecordIds }) => {
        const removed = new Set(memoryRecordIds);
        recordStore = recordStore.filter(
          (record) => !removed.has(record.memoryRecordId),
        );
      },
      listSessions: async () => ({
        items: Object.keys(eventsBySession),
        nextToken: undefined,
      }),
      listEvents: async ({ sessionId }) => ({
        items: eventsBySession[sessionId] ?? [],
        nextToken: undefined,
      }),
      deleteEvent: async ({ sessionId, eventId }) => {
        eventsBySession[sessionId] = (eventsBySession[sessionId] ?? []).filter(
          (id) => id !== eventId,
        );
      },
    };

    let auditIds: string[] = [];
    try {
      await seedMemory({ forget: true }, fakeClient);

      expect(recordStore).toEqual([]);
      expect(Object.values(eventsBySession).flat()).toEqual([]);

      await seedMemory({}, fakeClient);

      expect(createEventCalls).toHaveLength(3);
      expect(new Set(createEventCalls.map((call) => call.text)).size).toBe(3);
      for (const call of createEventCalls) {
        expect(call.text).not.toContain("Vega");
      }

      const audits = await sql<{ id: string }[]>`
        select id from public.audit_events
        where home_id = ${DEMO_SEED.home.id} and kind = 'memory_forgotten'
      `;
      auditIds = audits.map((row) => row.id);
    } finally {
      if (auditIds.length > 0) {
        await sql`delete from public.audit_events where id = any(${sql.array(auditIds)}::uuid[])`;
      }
      if (createdParty) {
        await sql`delete from public.parties where id = ${DEMO_SEED.parties[0].id}`;
      }
      if (createdHome) {
        await sql`delete from public.homes where id = ${DEMO_SEED.home.id}`;
      }
    }
  });

  it("erases the seeded Vega party's memory with --forget", async () => {
    // Never delete pre-existing demo data: only clean up rows this test
    // itself creates, tracked here rather than assumed absent.
    const [existingHome] = await sql<{ id: string }[]>`
      select id from public.homes where id = ${DEMO_SEED.home.id}
    `;
    const [existingParty] = await sql<{ id: string }[]>`
      select id from public.parties where id = ${DEMO_SEED.parties[0].id}
    `;
    const createdHome = !existingHome;
    const createdParty = !existingParty;
    if (createdHome) {
      await sql`
        insert into public.homes (id, name, timezone)
        values (${DEMO_SEED.home.id}, 'Seed memory test', 'Europe/Madrid')
      `;
    }
    if (createdParty) {
      await sql`
        insert into public.parties (id, home_id, family_name, locale, link_token)
        values (
          ${DEMO_SEED.parties[0].id}, ${DEMO_SEED.home.id}, 'Familia Vega', 'es',
          ${crypto.randomUUID()}
        )
      `;
    }

    const fakeClient: MemoryClient = {
      createEvent: async () => {
        throw new Error("createEvent must not be called by --forget");
      },
      listMemoryRecords: async (): Promise<
        Page<{ memoryRecordId: string; text: string; createdAt: Date }>
      > => ({ items: [] }),
      batchDeleteMemoryRecords: async () => undefined,
      listSessions: async () => ({ items: [] }),
      listEvents: async () => ({ items: [] }),
      deleteEvent: async () => undefined,
    };

    let auditId: string | undefined;
    try {
      await seedMemory({ forget: true }, fakeClient);

      const [audit] = await sql<
        { id: string; kind: string; payload: unknown }[]
      >`
        select id, kind, payload from public.audit_events
        where home_id = ${DEMO_SEED.home.id} and kind = 'memory_forgotten'
        order by created_at desc
        limit 1
      `;
      auditId = audit?.id;
      expect(audit).toMatchObject({
        kind: "memory_forgotten",
        payload: { partyId: DEMO_SEED.parties[0].id },
      });
    } finally {
      if (auditId) {
        await sql`delete from public.audit_events where id = ${auditId}`;
      }
      if (createdParty) {
        await sql`delete from public.parties where id = ${DEMO_SEED.parties[0].id}`;
      }
      if (createdHome) {
        await sql`delete from public.homes where id = ${DEMO_SEED.home.id}`;
      }
    }
  });
});
