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
