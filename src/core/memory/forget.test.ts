import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { MemoryClient, Page } from "./client";
import { forgetPartyMemory } from "./forget";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("forgetPartyMemory", () => {
  afterAll(() => sql.end());

  it("paginates records, deletes in batches of 100, sweeps every session's events, and audits the erasure", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone) values ('Forget test', 'Europe/Madrid')
      returning id
    `;
    const homeId = home!.id;
    const partyId = "22222222-2222-4222-8222-222222222222";
    const memoryId = "mem-test";
    const expectedActorId = `home-${homeId}/party-${partyId}`;
    const expectedNamespacePath = `/parties/${expectedActorId}`;

    // 250 records across two pages, to exercise both cross-page pagination
    // and the 100-record batch chunking within a page.
    const recordPages: Page<{
      memoryRecordId: string;
      text: string;
      createdAt: Date;
    }>[] = [
      {
        items: Array.from({ length: 150 }, (_unused, index) => ({
          memoryRecordId: `record-${index}`,
          text: "a remembered fact",
          createdAt: new Date(),
        })),
        nextToken: "records-page-2",
      },
      {
        items: Array.from({ length: 100 }, (_unused, index) => ({
          memoryRecordId: `record-${150 + index}`,
          text: "a remembered fact",
          createdAt: new Date(),
        })),
        nextToken: undefined,
      },
    ];
    const sessionsPage: Page<string> = {
      items: ["session-a", "session-b"],
      nextToken: undefined,
    };
    const eventsBySession: Record<string, Page<string>> = {
      "session-a": { items: ["event-1", "event-2"], nextToken: undefined },
      "session-b": { items: ["event-3"], nextToken: undefined },
    };

    const calls = {
      listMemoryRecords: [] as { namespacePath: string; nextToken?: string }[],
      batchDeleteMemoryRecords: [] as string[][],
      listSessions: [] as { actorId: string }[],
      listEvents: [] as { actorId: string; sessionId: string }[],
      deleteEvent: [] as { sessionId: string; eventId: string }[],
    };

    const fakeClient: MemoryClient = {
      createEvent: async () => {
        throw new Error("createEvent should not be called by forget");
      },
      listMemoryRecords: async ({ namespacePath, nextToken }) => {
        calls.listMemoryRecords.push({ namespacePath, nextToken });
        return nextToken ? recordPages[1]! : recordPages[0]!;
      },
      batchDeleteMemoryRecords: async ({ memoryRecordIds }) => {
        calls.batchDeleteMemoryRecords.push([...memoryRecordIds]);
      },
      listSessions: async ({ actorId }) => {
        calls.listSessions.push({ actorId });
        return sessionsPage;
      },
      listEvents: async ({ actorId, sessionId }) => {
        calls.listEvents.push({ actorId, sessionId });
        return eventsBySession[sessionId]!;
      },
      deleteEvent: async ({ sessionId, eventId }) => {
        calls.deleteEvent.push({ sessionId, eventId });
      },
    };

    try {
      const result = await forgetPartyMemory(
        sql,
        homeId,
        partyId,
        memoryId,
        "us-east-1",
        fakeClient,
      );

      expect(result).toEqual({ deletedRecords: 250, deletedEvents: 3 });
      expect(calls.listMemoryRecords).toEqual([
        { namespacePath: expectedNamespacePath, nextToken: undefined },
        { namespacePath: expectedNamespacePath, nextToken: "records-page-2" },
      ]);
      // 150 records batches into 100 + 50; 100 records is one more batch.
      expect(
        calls.batchDeleteMemoryRecords.map((batch) => batch.length),
      ).toEqual([100, 50, 100]);
      expect(calls.listSessions).toEqual([{ actorId: expectedActorId }]);
      expect(calls.listEvents).toEqual([
        { actorId: expectedActorId, sessionId: "session-a" },
        { actorId: expectedActorId, sessionId: "session-b" },
      ]);
      expect(calls.deleteEvent).toEqual([
        { sessionId: "session-a", eventId: "event-1" },
        { sessionId: "session-a", eventId: "event-2" },
        { sessionId: "session-b", eventId: "event-3" },
      ]);

      const [audit] = await sql<
        { actor: string; kind: string; payload: unknown }[]
      >`
        select actor, kind, payload from public.audit_events
        where home_id = ${homeId} and kind = 'memory_forgotten'
      `;
      expect(audit).toMatchObject({
        actor: "host",
        kind: "memory_forgotten",
        payload: { partyId, deletedRecords: 250, deletedEvents: 3 },
      });
    } finally {
      await sql`delete from public.homes where id = ${homeId}`;
    }
  });

  it("sweeps records from both strategy namespaces and events from the capture and seed sessions", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone) values ('Forget sweep', 'Europe/Madrid')
      returning id
    `;
    const homeId = home!.id;
    const partyId = "44444444-4444-4444-8444-444444444444";
    const memoryId = "mem-test";
    const expectedActorId = `home-${homeId}/party-${partyId}`;
    const expectedNamespacePath = `/parties/${expectedActorId}`;
    const hostId = "55555555-5555-4555-8555-555555555555";

    // A record from each strategy's own sub-namespace under the party's
    // subtree: `forgetPartyMemory` lists by the *parent* `namespacePath`
    // (hierarchical), so one page spanning both proves neither strategy's
    // namespace is missed without the code needing to know their names.
    const records = [
      // Conceptually under `${expectedNamespacePath}/preferences`.
      {
        memoryRecordId: "pref-1",
        text: JSON.stringify({ preference: "Prefers the ground floor room." }),
        createdAt: new Date(),
      },
      // Conceptually under `${expectedNamespacePath}/facts`.
      {
        memoryRecordId: "fact-1",
        text: "This family travels with one small dog.",
        createdAt: new Date(),
      },
    ];
    // Three sessions actually seen in production for this actor: the
    // deterministic host_capture write (`recordCaptureMemory`), a guest
    // conversation, and `scripts/seed-memory.ts`'s own seeded session.
    const sessionIds = [
      `capture_${hostId}`,
      "inv_66666666-...",
      "seed_memory_vega",
    ];
    const eventsBySession: Record<string, string[]> = {
      [`capture_${hostId}`]: ["event-capture-1"],
      "inv_66666666-...": ["event-guest-1", "event-guest-2"],
      seed_memory_vega: ["event-seed-1", "event-seed-2", "event-seed-3"],
    };

    const requestedNamespaces: string[] = [];
    const deletedRecordIds: string[] = [];
    const deletedEvents: { sessionId: string; eventId: string }[] = [];

    const fakeClient: MemoryClient = {
      createEvent: async () => {
        throw new Error("createEvent should not be called by forget");
      },
      listMemoryRecords: async ({ namespacePath }) => {
        requestedNamespaces.push(namespacePath);
        return { items: records, nextToken: undefined };
      },
      batchDeleteMemoryRecords: async ({ memoryRecordIds }) => {
        deletedRecordIds.push(...memoryRecordIds);
      },
      listSessions: async () => ({ items: sessionIds, nextToken: undefined }),
      listEvents: async ({ sessionId }) => ({
        items: eventsBySession[sessionId] ?? [],
        nextToken: undefined,
      }),
      deleteEvent: async ({ sessionId, eventId }) => {
        deletedEvents.push({ sessionId, eventId });
      },
    };

    try {
      const result = await forgetPartyMemory(
        sql,
        homeId,
        partyId,
        memoryId,
        "us-east-1",
        fakeClient,
      );

      // The parent namespacePath is requested, not one per strategy: the
      // service resolves it hierarchically to cover /preferences and
      // /facts both.
      expect(requestedNamespaces).toEqual([expectedNamespacePath]);
      expect(deletedRecordIds.sort()).toEqual(["fact-1", "pref-1"]);
      expect(result.deletedRecords).toBe(2);

      expect(deletedEvents).toEqual([
        { sessionId: `capture_${hostId}`, eventId: "event-capture-1" },
        { sessionId: "inv_66666666-...", eventId: "event-guest-1" },
        { sessionId: "inv_66666666-...", eventId: "event-guest-2" },
        { sessionId: "seed_memory_vega", eventId: "event-seed-1" },
        { sessionId: "seed_memory_vega", eventId: "event-seed-2" },
        { sessionId: "seed_memory_vega", eventId: "event-seed-3" },
      ]);
      expect(result.deletedEvents).toBe(6);
    } finally {
      await sql`delete from public.homes where id = ${homeId}`;
    }
  });

  it("writes an audit row with zero counts when nothing is remembered", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone) values ('Forget empty', 'Europe/Madrid')
      returning id
    `;
    const homeId = home!.id;
    const partyId = "33333333-3333-4333-8333-333333333333";

    const emptyClient: MemoryClient = {
      createEvent: async () => undefined,
      listMemoryRecords: async () => ({ items: [], nextToken: undefined }),
      batchDeleteMemoryRecords: async () => {
        throw new Error("must not be called with zero records");
      },
      listSessions: async () => ({ items: [], nextToken: undefined }),
      listEvents: async () => ({ items: [], nextToken: undefined }),
      deleteEvent: async () => undefined,
    };

    try {
      const result = await forgetPartyMemory(
        sql,
        homeId,
        partyId,
        "mem-test",
        "us-east-1",
        emptyClient,
      );
      expect(result).toEqual({ deletedRecords: 0, deletedEvents: 0 });
    } finally {
      await sql`delete from public.homes where id = ${homeId}`;
    }
  });
});
