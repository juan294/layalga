import "@/core/server-only";

import { sqlClient, type DatabaseClient } from "@/core/db/client";

import type { MemoryInventoryClient } from "./client";
import { deleteAllEvents, deleteAllMemoryRecords } from "./forget";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PARTY_ACTOR = `home-(${UUID})/party-${UUID}`;
const ACTOR_ID = new RegExp(`^${PARTY_ACTOR}$`);
const PARTY_NAMESPACE = new RegExp(`^/parties/(${PARTY_ACTOR})(?:/|$)`);

export interface OrphanedMemoryActor {
  actorId: string;
  homeId: string;
}

export interface ForgetOrphanedMemoryResult {
  applied: boolean;
  orphanActorIds: string[];
  orphanHomeIds: string[];
  deletedRecords: number;
  deletedEvents: number;
}

/**
 * Lists every party actor AgentCore Memory still holds whose home no longer
 * exists. Actors come from both `ListActors` (raw events, which expire after
 * 30 days) and the namespaces of the long-term records under `/parties/`
 * (which do not expire). Only ids of the exact `home-<uuid>/party-<uuid>`
 * shape count; anything else is ignored, never reported as an orphan.
 *
 * Memory is listed before the homes table is read, so a home that wrote
 * memory and still exists is always in the set it is checked against.
 */
export async function findOrphanedMemoryActors(
  database: DatabaseClient,
  memoryId: string,
  client: MemoryInventoryClient,
): Promise<OrphanedMemoryActor[]> {
  const actorIds = new Set<string>();

  let actorsToken: string | undefined;
  do {
    const page = await client.listActors({ memoryId, nextToken: actorsToken });
    for (const actorId of page.items) {
      if (ACTOR_ID.test(actorId)) actorIds.add(actorId);
    }
    actorsToken = page.nextToken;
  } while (actorsToken);

  let recordsToken: string | undefined;
  do {
    const page = await client.listMemoryRecords({
      memoryId,
      namespacePath: "/parties/",
      nextToken: recordsToken,
    });
    for (const record of page.items) {
      for (const namespace of record.namespaces ?? []) {
        const actorId = PARTY_NAMESPACE.exec(namespace)?.[1];
        if (actorId) actorIds.add(actorId);
      }
    }
    recordsToken = page.nextToken;
  } while (recordsToken);

  // No array parameter: postgres.js has mis-serialized one on a fresh
  // connection's first query, so the home ids are filtered here instead.
  const sql = sqlClient(database);
  const homes = await sql<
    { id: string }[]
  >`select id::text as id from public.homes`;
  const existingHomeIds = new Set(homes.map(({ id }) => id));

  return [...actorIds]
    .sort()
    .map((actorId) => ({ actorId, homeId: ACTOR_ID.exec(actorId)![1]! }))
    .filter(({ homeId }) => !existingHomeIds.has(homeId));
}

/**
 * Finds orphaned party memory (see `findOrphanedMemoryActors`) and, only
 * with `apply: true`, erases each orphan's records and events. Unlike
 * `forgetPartyMemory` it writes no audit row: the home it would belong to
 * is gone.
 */
export async function forgetOrphanedMemory(
  database: DatabaseClient,
  memoryId: string,
  client: MemoryInventoryClient,
  { apply = false }: { apply?: boolean } = {},
): Promise<ForgetOrphanedMemoryResult> {
  const orphans = await findOrphanedMemoryActors(database, memoryId, client);
  let deletedRecords = 0;
  let deletedEvents = 0;
  if (apply) {
    for (const { actorId } of orphans) {
      deletedRecords += await deleteAllMemoryRecords(
        client,
        memoryId,
        `/parties/${actorId}`,
      );
      deletedEvents += await deleteAllEvents(client, memoryId, actorId);
    }
  }
  return {
    applied: apply,
    orphanActorIds: orphans.map(({ actorId }) => actorId),
    orphanHomeIds: [...new Set(orphans.map(({ homeId }) => homeId))],
    deletedRecords,
    deletedEvents,
  };
}
