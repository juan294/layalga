import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "@/core/db/client";
import type { MemoryInventoryClient, Page } from "./client";
import {
  findOrphanedMemoryActors,
  forgetOrphanedMemory,
  REAL_HOUSEHOLD_HOME_ID,
} from "./orphans";

const LIVE_HOME = "11111111-1111-4111-8111-111111111111";
const GONE_HOME = "22222222-2222-4222-8222-222222222222";
const OTHER_GONE_HOME = "33333333-3333-4333-8333-333333333333";
const PARTY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARTY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const actor = (homeId: string, partyId: string) =>
  `home-${homeId}/party-${partyId}`;

interface FakeRecord {
  id: string;
  /** The namespace the record lives in, matched against the listing prefix. */
  namespace: string;
  /** What the listing reports as its namespaces; defaults to `[namespace]`. */
  listedNamespaces?: string[];
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
 * Next tokens are offsets, so a deletion between pages shifts what the next
 * page returns, as an offset-style service token would.
 */
function fakeMemory(state: FakeMemoryState = {}) {
  const records = [...(state.records ?? [])];
  const events = structuredClone(state.events ?? {});
  const deletedRecordIds: string[] = [];
  const deletedEvents: string[] = [];

  function page<T>(items: T[], nextToken: string | undefined): Page<T> {
    const start = nextToken ? Number(nextToken) : 0;
    const end = start + 2;
    return {
      items: items.slice(start, end),
      nextToken: end < items.length ? String(end) : undefined,
    };
  }

  // Like AgentCore, sessions (and so actors) stay listed after their
  // events are deleted.
  const sessionsOf = (actorId: string) => Object.keys(events[actorId] ?? {});

  const client: MemoryInventoryClient = {
    createEvent: vi.fn(async () => {
      throw new Error("orphan cleanup must never write memory");
    }),
    listActors: vi.fn(async ({ nextToken }) =>
      page(
        [
          ...Object.keys(events).filter(
            (actorId) => sessionsOf(actorId).length > 0,
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
            namespaces: record.listedNamespaces ?? [record.namespace],
          })),
        nextToken,
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
      page(sessionsOf(actorId), nextToken),
    ),
    listEvents: vi.fn(async ({ actorId, sessionId, nextToken }) =>
      page(events[actorId]?.[sessionId] ?? [], nextToken),
    ),
    deleteEvent: vi.fn(async ({ actorId, sessionId, eventId }) => {
      const session = events[actorId]?.[sessionId] ?? [];
      session.splice(session.indexOf(eventId), 1);
      deletedEvents.push(`${actorId}:${sessionId}:${eventId}`);
    }),
  };
  return { client, records, deletedRecordIds, deletedEvents };
}

/**
 * The homes-and-parties read. By default every home has `PARTY_A` and
 * `PARTY_B`, so only a missing home makes an actor orphaned; pass
 * `parties` to choose each home's parties.
 */
function homesDatabase(
  homeIds: string[],
  parties: Record<string, string[]> = {},
) {
  return vi.fn().mockResolvedValue(
    homeIds.flatMap(
      (homeId): { home_id: string; party_id: string | null }[] => {
        const partyIds = parties[homeId] ?? [PARTY_A, PARTY_B];
        return partyIds.length === 0
          ? [{ home_id: homeId, party_id: null }]
          : partyIds.map((partyId) => ({ home_id: homeId, party_id: partyId }));
      },
    ),
  );
}

const asDatabase = (database: ReturnType<typeof homesDatabase>) =>
  database as unknown as DatabaseClient;

const existingHomes = [REAL_HOUSEHOLD_HOME_ID, LIVE_HOME];

describe("findOrphanedMemoryActors", () => {
  it("finds an orphan known only from its events", async () => {
    const { client } = fakeMemory({
      events: { [actor(GONE_HOME, PARTY_A)]: { s1: ["e1"] } },
    });

    const inventory = await findOrphanedMemoryActors(
      asDatabase(homesDatabase(existingHomes)),
      "memory-1",
      client,
    );

    expect(inventory.orphans).toEqual([
      { actorId: actor(GONE_HOME, PARTY_A), homeId: GONE_HOME },
    ]);
    expect(inventory.homesRead).toBe(2);
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

    const inventory = await findOrphanedMemoryActors(
      asDatabase(homesDatabase(existingHomes)),
      "memory-1",
      client,
    );

    expect(inventory).toEqual({
      orphans: [{ actorId: actor(GONE_HOME, PARTY_A), homeId: GONE_HOME }],
      homesRead: 2,
      partiesRead: 4,
      recordsSeen: 1,
      unparsedRecords: 0,
    });
    expect(client.listMemoryRecords).toHaveBeenCalledWith({
      memoryId: "memory-1",
      namespacePath: "/parties",
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

    const inventory = await findOrphanedMemoryActors(
      asDatabase(homesDatabase(existingHomes)),
      "memory-1",
      client,
    );

    expect(inventory.orphans).toEqual([
      { actorId: actor(GONE_HOME, PARTY_A), homeId: GONE_HOME },
      { actorId: actor(GONE_HOME, PARTY_B), homeId: GONE_HOME },
      { actorId: actor(OTHER_GONE_HOME, PARTY_B), homeId: OTHER_GONE_HOME },
    ]);
    expect(client.listActors).toHaveBeenCalledTimes(2);
    expect(client.listMemoryRecords).toHaveBeenCalledTimes(2);
  });

  it("finds memory of a party that no longer exists in a home that does", async () => {
    const { client } = fakeMemory({
      records: [
        {
          id: "r1",
          namespace: `/parties/${actor(REAL_HOUSEHOLD_HOME_ID, PARTY_A)}/facts`,
        },
        {
          id: "r2",
          namespace: `/parties/${actor(LIVE_HOME, PARTY_A)}/facts`,
        },
      ],
      events: { [actor(REAL_HOUSEHOLD_HOME_ID, PARTY_B)]: { s1: ["e1"] } },
    });

    const inventory = await findOrphanedMemoryActors(
      asDatabase(
        homesDatabase(existingHomes, { [REAL_HOUSEHOLD_HOME_ID]: [] }),
      ),
      "memory-1",
      client,
    );

    expect(inventory.orphans).toEqual([
      {
        actorId: actor(REAL_HOUSEHOLD_HOME_ID, PARTY_A),
        homeId: REAL_HOUSEHOLD_HOME_ID,
      },
      {
        actorId: actor(REAL_HOUSEHOLD_HOME_ID, PARTY_B),
        homeId: REAL_HOUSEHOLD_HOME_ID,
      },
    ]);
    expect(inventory.homesRead).toBe(2);
  });

  it("skips an actor AgentCore still lists after its events were deleted", async () => {
    const { client } = fakeMemory({
      extraActors: [actor(GONE_HOME, PARTY_A)],
      events: { [actor(GONE_HOME, PARTY_B)]: { s1: ["e1"] } },
    });

    const inventory = await findOrphanedMemoryActors(
      asDatabase(homesDatabase(existingHomes)),
      "memory-1",
      client,
    );

    expect(inventory.orphans).toEqual([
      { actorId: actor(GONE_HOME, PARTY_B), homeId: GONE_HOME },
    ]);
  });

  it("skips an actor whose sessions no longer hold any event", async () => {
    const { client } = fakeMemory({
      events: {
        [actor(GONE_HOME, PARTY_A)]: { s1: [], s2: [] },
        [actor(GONE_HOME, PARTY_B)]: { s1: [], s2: ["e1"] },
      },
    });

    const inventory = await findOrphanedMemoryActors(
      asDatabase(homesDatabase(existingHomes)),
      "memory-1",
      client,
    );

    expect(inventory.orphans).toEqual([
      { actorId: actor(GONE_HOME, PARTY_B), homeId: GONE_HOME },
    ]);
  });

  it("treats a party filed under another home as orphaned there", async () => {
    const { client } = fakeMemory({
      events: { [actor(LIVE_HOME, PARTY_A)]: { s1: ["e1"] } },
    });

    const inventory = await findOrphanedMemoryActors(
      asDatabase(
        homesDatabase(existingHomes, {
          [REAL_HOUSEHOLD_HOME_ID]: [PARTY_A],
          [LIVE_HOME]: [PARTY_B],
        }),
      ),
      "memory-1",
      client,
    );

    expect(inventory.orphans).toEqual([
      { actorId: actor(LIVE_HOME, PARTY_A), homeId: LIVE_HOME },
    ]);
  });

  it("reads the homes table only after both memory listings", async () => {
    const { client } = fakeMemory({
      records: [
        { id: "r1", namespace: `/parties/${actor(GONE_HOME, PARTY_A)}/facts` },
        { id: "r2", namespace: `/parties/${actor(GONE_HOME, PARTY_B)}/facts` },
        { id: "r3", namespace: `/parties/${actor(LIVE_HOME, PARTY_A)}/facts` },
      ],
      events: {
        [actor(GONE_HOME, PARTY_A)]: { s1: ["e1"] },
        [actor(GONE_HOME, PARTY_B)]: { s1: ["e1"] },
        [actor(LIVE_HOME, PARTY_B)]: { s1: ["e1"] },
      },
    });
    const database = homesDatabase(existingHomes);

    await findOrphanedMemoryActors(asDatabase(database), "memory-1", client);

    const lastListing = Math.max(
      ...vi.mocked(client.listActors).mock.invocationCallOrder,
      ...vi.mocked(client.listMemoryRecords).mock.invocationCallOrder,
    );
    expect(database.mock.invocationCallOrder).toHaveLength(1);
    expect(database.mock.invocationCallOrder[0]).toBeGreaterThan(lastListing);
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

    const inventory = await findOrphanedMemoryActors(
      asDatabase(homesDatabase(existingHomes)),
      "memory-1",
      client,
    );

    expect(inventory.orphans).toEqual([]);
    expect(inventory.unparsedRecords).toBe(3);
  });

  it("counts listed records whose namespaces name no party", async () => {
    const { client } = fakeMemory({
      records: [
        {
          id: "r1",
          namespace: `/parties/${actor(GONE_HOME, PARTY_A)}/facts`,
        },
        {
          id: "r2",
          namespace: `/parties/${actor(GONE_HOME, PARTY_B)}/facts`,
          listedNamespaces: [],
        },
        {
          id: "r3",
          namespace: `/parties/${actor(GONE_HOME, PARTY_B)}/facts`,
          listedNamespaces: ["/parties/unknown"],
        },
      ],
    });

    const inventory = await findOrphanedMemoryActors(
      asDatabase(homesDatabase(existingHomes)),
      "memory-1",
      client,
    );

    expect(inventory).toEqual({
      orphans: [{ actorId: actor(GONE_HOME, PARTY_A), homeId: GONE_HOME }],
      homesRead: 2,
      partiesRead: 4,
      recordsSeen: 3,
      unparsedRecords: 2,
    });
  });

  it("refuses to classify anything when the homes read returns no rows", async () => {
    const { client } = fakeMemory({
      events: { [actor(GONE_HOME, PARTY_A)]: { s1: ["e1"] } },
    });

    await expect(
      findOrphanedMemoryActors(
        asDatabase(homesDatabase([])),
        "memory-1",
        client,
      ),
    ).rejects.toThrow("Read 0 homes");
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
        asDatabase(homesDatabase(existingHomes)),
        "memory-1",
        memory.client,
      ),
    ).resolves.toEqual({
      applied: false,
      homesRead: 2,
      partiesRead: 4,
      recordsSeen: 4,
      unparsedRecords: 0,
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
    const database = homesDatabase(existingHomes);

    await expect(
      forgetOrphanedMemory(asDatabase(database), "memory-1", memory.client, {
        apply: true,
      }),
    ).resolves.toEqual({
      applied: true,
      homesRead: 2,
      partiesRead: 4,
      recordsSeen: 4,
      unparsedRecords: 0,
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
        asDatabase(homesDatabase([...existingHomes, GONE_HOME])),
        "memory-1",
        memory.client,
        { apply: true },
      ),
    ).resolves.toMatchObject({
      applied: true,
      orphanActorIds: [],
      orphanHomeIds: [],
      deletedRecords: 0,
      deletedEvents: 0,
    });
    expect(memory.client.batchDeleteMemoryRecords).not.toHaveBeenCalled();
    expect(memory.client.deleteEvent).not.toHaveBeenCalled();
  });

  it("deletes nothing when the homes read returns no rows", async () => {
    const memory = fakeMemory(state());

    await expect(
      forgetOrphanedMemory(
        asDatabase(homesDatabase([])),
        "memory-1",
        memory.client,
        { apply: true },
      ),
    ).rejects.toThrow("Read 0 homes");
    expect(memory.client.batchDeleteMemoryRecords).not.toHaveBeenCalled();
    expect(memory.client.deleteEvent).not.toHaveBeenCalled();
  });

  it("refuses to apply when the real household is not among the homes read", async () => {
    const memory = fakeMemory(state());

    await expect(
      forgetOrphanedMemory(
        asDatabase(homesDatabase([LIVE_HOME])),
        "memory-1",
        memory.client,
        { apply: true },
      ),
    ).rejects.toThrow(REAL_HOUSEHOLD_HOME_ID);
    expect(memory.client.batchDeleteMemoryRecords).not.toHaveBeenCalled();
    expect(memory.client.deleteEvent).not.toHaveBeenCalled();

    // A dry run against the same read still reports, so the owner can see
    // what a wrong database would have deleted.
    await expect(
      forgetOrphanedMemory(
        asDatabase(homesDatabase([LIVE_HOME])),
        "memory-1",
        fakeMemory(state()).client,
      ),
    ).resolves.toMatchObject({ applied: false, orphanHomeIds: [GONE_HOME] });
  });
});
