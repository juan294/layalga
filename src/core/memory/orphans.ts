import "@/core/server-only";

import { sqlClient, type DatabaseClient } from "@/core/db/client";

import { listAllPages, type MemoryInventoryClient } from "./client";
import { forgetActorMemory } from "./forget";

/** The one real household, converted from the demo home during the real-use launch. */
export const REAL_HOUSEHOLD_HOME_ID = "00000000-0000-4000-8000-000000000001";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PARTY_ACTOR = `home-(${UUID})/party-${UUID}`;
const ACTOR_ID = new RegExp(`^${PARTY_ACTOR}$`);
const PARTY_NAMESPACE = new RegExp(`^/parties/(${PARTY_ACTOR})(?:/|$)`);

export interface OrphanedMemoryActor {
  actorId: string;
  homeId: string;
}

export interface OrphanedMemoryInventory {
  orphans: OrphanedMemoryActor[];
  /** Distinct homes the homes-and-parties read returned. */
  homesRead: number;
  /** Parties that read returned. */
  partiesRead: number;
  /** Long-term records listed under `/parties`. */
  recordsSeen: number;
  /** Listed records with no `home-<uuid>/party-<uuid>` namespace; never checked. */
  unparsedRecords: number;
}

export interface ForgetOrphanedMemoryResult extends Omit<
  OrphanedMemoryInventory,
  "orphans"
> {
  applied: boolean;
  orphanActorIds: string[];
  orphanHomeIds: string[];
  deletedRecords: number;
  deletedEvents: number;
}

/**
 * Lists every party actor AgentCore Memory still holds whose party no
 * longer exists in its home: the home was deleted (a probe fixture), or the
 * party was (the synthetic parties the real-use conversion removed). The
 * agent reads a home's whole `/parties/home-<id>` subtree, so a deleted
 * party's memory would otherwise still reach that household. Actors come from both `ListActors` (raw events, which expire after
 * 30 days) and the namespaces of the long-term records under `/parties`
 * (which do not expire). Only ids of the exact `home-<uuid>/party-<uuid>`
 * shape count; anything else is ignored, never reported as an orphan, and
 * a listed record without such a namespace is counted as unparsed.
 *
 * Memory is listed before homes and parties are read, so a party that
 * wrote memory and still exists is always in the set it is checked against. The
 * read fails closed: no rows (or, with `requireRealHousehold`, no real
 * household) means a wrong database, which would make every actor look
 * orphaned.
 */
export async function findOrphanedMemoryActors(
  database: DatabaseClient,
  memoryId: string,
  client: MemoryInventoryClient,
  { requireRealHousehold = false }: { requireRealHousehold?: boolean } = {},
): Promise<OrphanedMemoryInventory> {
  /** Party actor id -> its home id, for every well-formed actor seen. */
  const actorHomes = new Map<string, string>();
  const addActor = (actorId: string): boolean => {
    const homeId = ACTOR_ID.exec(actorId)?.[1];
    if (homeId) actorHomes.set(actorId, homeId);
    return Boolean(homeId);
  };

  const actors = await listAllPages((nextToken) =>
    client.listActors({ memoryId, nextToken }),
  );
  for (const actorId of actors) addActor(actorId);

  const records = await listAllPages((nextToken) =>
    client.listMemoryRecords({
      memoryId,
      namespacePath: "/parties",
      nextToken,
    }),
  );
  const actorsWithRecords = new Set<string>();
  let unparsedRecords = 0;
  for (const record of records) {
    let attributed = false;
    for (const namespace of record.namespaces ?? []) {
      const actorId = PARTY_NAMESPACE.exec(namespace)?.[1];
      if (actorId && addActor(actorId)) {
        actorsWithRecords.add(actorId);
        attributed = true;
      }
    }
    if (!attributed) unparsedRecords += 1;
  }

  // No array parameter: postgres.js has mis-serialized one on a fresh
  // connection's first query, so the actors are filtered here instead.
  const sql = sqlClient(database);
  const rows = await sql<{ home_id: string; party_id: string | null }[]>`
    select h.id::text as home_id, p.id::text as party_id
    from public.homes h
    left join public.parties p on p.home_id = h.id
  `;
  const existingHomeIds = new Set(rows.map((row) => row.home_id));
  const existingActors = new Set(
    rows.flatMap(({ home_id, party_id }) =>
      party_id ? [`home-${home_id}/party-${party_id}`] : [],
    ),
  );
  if (existingHomeIds.size === 0) {
    throw new Error(
      "Read 0 homes; refusing to treat all memory as orphaned. Check DATABASE_URL.",
    );
  }
  if (requireRealHousehold && !existingHomeIds.has(REAL_HOUSEHOLD_HOME_ID)) {
    throw new Error(
      `The real household ${REAL_HOUSEHOLD_HOME_ID} is not among the homes read; refusing to delete. Check DATABASE_URL.`,
    );
  }

  const orphans: OrphanedMemoryActor[] = [];
  for (const [actorId, homeId] of [...actorHomes].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (existingActors.has(actorId)) continue;
    // AgentCore keeps listing an actor after its events are deleted, so an
    // actor known only from ListActors counts only while it has a session.
    if (
      !actorsWithRecords.has(actorId) &&
      (await client.listSessions({ memoryId, actorId })).items.length === 0
    ) {
      continue;
    }
    orphans.push({ actorId, homeId });
  }

  return {
    orphans,
    homesRead: existingHomeIds.size,
    partiesRead: existingActors.size,
    recordsSeen: records.length,
    unparsedRecords,
  };
}

/**
 * Finds orphaned party memory (see `findOrphanedMemoryActors`) and, only
 * with `apply: true`, erases each orphan's records and events. Applying
 * also requires the real household among the homes read. Unlike
 * `forgetPartyMemory` it writes no audit row: the party it would describe
 * is gone.
 */
export async function forgetOrphanedMemory(
  database: DatabaseClient,
  memoryId: string,
  client: MemoryInventoryClient,
  { apply = false }: { apply?: boolean } = {},
): Promise<ForgetOrphanedMemoryResult> {
  const { orphans, ...inventory } = await findOrphanedMemoryActors(
    database,
    memoryId,
    client,
    { requireRealHousehold: apply },
  );
  let deletedRecords = 0;
  let deletedEvents = 0;
  if (apply) {
    for (const { actorId } of orphans) {
      const forgotten = await forgetActorMemory(client, memoryId, actorId);
      deletedRecords += forgotten.deletedRecords;
      deletedEvents += forgotten.deletedEvents;
    }
  }
  return {
    applied: apply,
    ...inventory,
    orphanActorIds: orphans.map(({ actorId }) => actorId),
    orphanHomeIds: [...new Set(orphans.map(({ homeId }) => homeId))],
    deletedRecords,
    deletedEvents,
  };
}
