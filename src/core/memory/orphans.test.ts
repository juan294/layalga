import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "@/core/db/client";
import type { MemoryInventoryClient, Page } from "./client";
import { findOrphanedMemoryActors, forgetOrphanedMemory } from "./orphans";

const LIVE_HOME = "11111111-1111-4111-8111-111111111111";
const GONE_HOME = "22222222-2222-4222-8222-222222222222";
const OTHER_GONE_HOME = "33333333-3333-4333-8333-333333333333";
const PARTY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARTY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const actor = (homeId: string, partyId: string) =>
  `home-${homeId}/party-${partyId}`;

interface FakeRecord {
  id: string;
  namespace: string;
}

interface FakeMemoryState {
  records?: FakeRecord[];
  /** Event ids per actor id, then per session id. */
  events?: Record<string, Record<string, string[]>>;
  /** Actor ids `ListActors` returns beyond those with events. */
  extraActors?: string[];
}

/**
 * An in-memory AgentCore Memory: records filtered by namespace prefix,
 * events per actor and session, every listing paged two items at a time.
 */
function fakeMemory(state: FakeMemoryState = {}) {
  const records = [...(state.records ?? [])];
  const events = structuredClone(state.events ?? {});
  const deletedRecordIds: string[] = [];
  const deletedEvents: string[] = [];

  // The next token is the key of the first item of the next page, so a
  // deletion between pages does not shift what the next page returns.
  function page<T>(
    items: T[],
    nextToken: string | undefined,
    key: (item: T) => string = String,
  ): Page<T> {
    const start = nextToken
      ? items.findIndex((item) => key(item) === nextToken)
      : 0;
    if (start < 0) return { items: [] };
    const next = items[start + 2];
    return {
      items: items.slice(start, start + 2),
      nextToken: next === undefined ? undefined : key(next),
    };
  }

  const client: MemoryInventoryClient = {
    createEvent: vi.fn(async () => {
      throw new Error("orphan cleanup must never write memory");
    }),
    listActors: vi.fn(async ({ nextToken }) =>
      page(
        [
          ...Object.keys(events).filter(
            (actorId) => Object.keys(events[actorId] ?? {}).length > 0,
          ),
          ...(state.extraActors ?? []),
        ],
        nextToken,
      ),
    ),
    listMemoryRecords: vi.fn(async ({ namespacePath, nextToken }) =>
      page(
        records
          .filter((record) => record.namespace.startsWith(namespacePath))
          .map((record) => ({
            memoryRecordId: record.id,
            text: "fact",
            createdAt: new Date("2026-10-15T10:00:00Z"),
            namespaces: [record.namespace],
          })),
        nextToken,
        (record) => record.memoryRecordId,
      ),
    ),
    batchDeleteMemoryRecords: vi.fn(async ({ memoryRecordIds }) => {
      for (const id of memoryRecordIds) {
        const index = records.findIndex((record) => record.id === id);
        if (index >= 0) records.splice(index, 1);
        deletedRecordIds.push(id);
      }
    }),
    listSessions: vi.fn(async ({ actorId, nextToken }) =>
      page(Object.keys(events[actorId] ?? {}), nextToken),
    ),
    listEvents: vi.fn(async ({ actorId, sessionId, nextToken }) =>
      page(events[actorId]?.[sessionId] ?? [], nextToken),
    ),
    deleteEvent: vi.fn(async ({ actorId, sessionId, eventId }) => {
      deletedEvents.push(`${actorId}:${sessionId}:${eventId}`);
    }),
  };
  return { client, records, deletedRecordIds, deletedEvents };
}

function homesDatabase(homeIds: string[]): DatabaseClient {
  return vi
    .fn()
    .mockResolvedValue(
      homeIds.map((id) => ({ id })),
    ) as unknown as DatabaseClient;
}

describe("findOrphanedMemoryActors", () => {
  it("finds an orphan known only from its events", async () => {
    const { client } = fakeMemory({
      events: { [actor(GONE_HOME, PARTY_A)]: { s1: ["e1"] } },
    });

    await expect(
      findOrphanedMemoryActors(homesDatabase([LIVE_HOME]), "memory-1", client),
    ).resolves.toEqual([
      { actorId: actor(GONE_HOME, PARTY_A), homeId: GONE_HOME },
    ]);
  });

  it("finds an orphan known only from its long-term records", async () => {
    const { client } = fakeMemory({
      records: [
        {
          id: "r1",
          namespace: `/parties/${actor(GONE_HOME, PARTY_A)}/preferences`,
        },
      ],
    });

    await expect(
      findOrphanedMemoryActors(homesDatabase([LIVE_HOME]), "memory-1", client),
    ).resolves.toEqual([
      { actorId: actor(GONE_HOME, PARTY_A), homeId: GONE_HOME },
    ]);
    expect(client.listMemoryRecords).toHaveBeenCalledWith({
      memoryId: "memory-1",
      namespacePath: "/parties/",
      nextToken: undefined,
    });
  });

  it("merges events and records across pages without duplicates", async () => {
    const { client } = fakeMemory({
      records: [
        { id: "r1", namespace: `/parties/${actor(GONE_HOME, PARTY_A)}/facts` },
        { id: "r2", namespace: `/parties/${actor(LIVE_HOME, PARTY_A)}/facts` },
        {
          id: "r3",
          namespace: `/parties/${actor(OTHER_GONE_HOME, PARTY_B)}/facts`,
        },
      ],
      events: {
        [actor(LIVE_HOME, PARTY_B)]: { s1: ["e1"] },
        [actor(GONE_HOME, PARTY_A)]: { s1: ["e1"] },
        [actor(GONE_HOME, PARTY_B)]: { s1: ["e1"] },
      },
    });

    const orphans = await findOrphanedMemoryActors(
      homesDatabase([LIVE_HOME]),
      "memory-1",
      client,
    );

    expect(orphans).toEqual([
      { actorId: actor(GONE_HOME, PARTY_A), homeId: GONE_HOME },
      { actorId: actor(GONE_HOME, PARTY_B), homeId: GONE_HOME },
      { actorId: actor(OTHER_GONE_HOME, PARTY_B), homeId: OTHER_GONE_HOME },
    ]);
    expect(client.listActors).toHaveBeenCalledTimes(2);
    expect(client.listMemoryRecords).toHaveBeenCalledTimes(2);
  });

  it("ignores actor ids and namespaces that are not exactly home-<uuid>/party-<uuid>", async () => {
    const { client } = fakeMemory({
      extraActors: [
        `home-${GONE_HOME}`,
        `home-${GONE_HOME}/party-not-a-uuid`,
        `home-${GONE_HOME}/party-${PARTY_A.toUpperCase()}`,
        `${actor(GONE_HOME, PARTY_A)}/extra`,
        `prefix-${actor(GONE_HOME, PARTY_A)}`,
        "home-1/party-1",
      ],
      records: [
        { id: "r1", namespace: `/parties/home-${GONE_HOME}/preferences` },
        { id: "r2", namespace: `/parties/${actor(GONE_HOME, PARTY_A)}x/facts` },
        { id: "r3", namespace: "/parties/home-1/party-1/facts" },
      ],
    });

    await expect(
      findOrphanedMemoryActors(homesDatabase([]), "memory-1", client),
    ).resolves.toEqual([]);
  });
});

describe("forgetOrphanedMemory", () => {
  const state = (): FakeMemoryState => ({
    records: [
      { id: "r1", namespace: `/parties/${actor(GONE_HOME, PARTY_A)}/facts` },
      {
        id: "r2",
        namespace: `/parties/${actor(GONE_HOME, PARTY_A)}/preferences`,
      },
      { id: "r3", namespace: `/parties/${actor(GONE_HOME, PARTY_A)}/facts` },
      { id: "live", namespace: `/parties/${actor(LIVE_HOME, PARTY_A)}/facts` },
    ],
    events: {
      [actor(GONE_HOME, PARTY_A)]: { s1: ["e1", "e2", "e3"], s2: ["e4"] },
      [actor(GONE_HOME, PARTY_B)]: { s1: ["e1"] },
      [actor(LIVE_HOME, PARTY_A)]: { s1: ["live-event"] },
    },
  });

  it("only reports on a dry run, which is the default", async () => {
    const memory = fakeMemory(state());

    await expect(
      forgetOrphanedMemory(
        homesDatabase([LIVE_HOME]),
        "memory-1",
        memory.client,
      ),
    ).resolves.toEqual({
      applied: false,
      orphanActorIds: [actor(GONE_HOME, PARTY_A), actor(GONE_HOME, PARTY_B)],
      orphanHomeIds: [GONE_HOME],
      deletedRecords: 0,
      deletedEvents: 0,
    });
    expect(memory.client.batchDeleteMemoryRecords).not.toHaveBeenCalled();
    expect(memory.client.deleteEvent).not.toHaveBeenCalled();
  });

  it("deletes every orphan's records and events and never touches a live home", async () => {
    const memory = fakeMemory(state());
    const database = homesDatabase([LIVE_HOME]);

    await expect(
      forgetOrphanedMemory(database, "memory-1", memory.client, {
        apply: true,
      }),
    ).resolves.toEqual({
      applied: true,
      orphanActorIds: [actor(GONE_HOME, PARTY_A), actor(GONE_HOME, PARTY_B)],
      orphanHomeIds: [GONE_HOME],
      deletedRecords: 3,
      deletedEvents: 5,
    });

    expect(memory.deletedRecordIds.sort()).toEqual(["r1", "r2", "r3"]);
    expect(memory.records.map(({ id }) => id)).toEqual(["live"]);
    expect(memory.deletedEvents).not.toContain(
      `${actor(LIVE_HOME, PARTY_A)}:s1:live-event`,
    );
    expect(memory.deletedEvents).toHaveLength(5);
    for (const call of vi.mocked(memory.client.listMemoryRecords).mock.calls) {
      expect(call[0].namespacePath).not.toContain(LIVE_HOME);
    }
    for (const call of vi.mocked(memory.client.listSessions).mock.calls) {
      expect(call[0].actorId).not.toContain(LIVE_HOME);
    }
    // One read of the homes table, and no audit row: the home is gone.
    expect(database).toHaveBeenCalledTimes(1);
  });

  it("does nothing when every remembered home still exists", async () => {
    const memory = fakeMemory(state());

    await expect(
      forgetOrphanedMemory(
        homesDatabase([LIVE_HOME, GONE_HOME]),
        "memory-1",
        memory.client,
        { apply: true },
      ),
    ).resolves.toEqual({
      applied: true,
      orphanActorIds: [],
      orphanHomeIds: [],
      deletedRecords: 0,
      deletedEvents: 0,
    });
    expect(memory.client.batchDeleteMemoryRecords).not.toHaveBeenCalled();
    expect(memory.client.deleteEvent).not.toHaveBeenCalled();
  });
});
