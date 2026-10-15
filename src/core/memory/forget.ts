import "@/core/server-only";

import { sqlClient, type DatabaseClient } from "@/core/db/client";

import { createMemoryClient, listAllPages, type MemoryClient } from "./client";

export interface ForgetPartyMemoryResult {
  deletedRecords: number;
  deletedEvents: number;
}

/**
 * Erases everything AgentCore Memory remembers about one party: every
 * memory record under its namespace subtree (in batches of 100, the
 * `BatchDeleteMemoryRecords` limit) and every raw event across every
 * session for its actor id. Writes one `memory_forgotten` audit row with
 * actor `host` so the erasure itself is accountable (A9).
 */
export async function forgetPartyMemory(
  database: DatabaseClient,
  homeId: string,
  partyId: string,
  memoryId: string,
  region: string,
  client: MemoryClient = createMemoryClient(region),
): Promise<ForgetPartyMemoryResult> {
  const result = await forgetActorMemory(
    client,
    memoryId,
    `home-${homeId}/party-${partyId}`,
  );

  const sql = sqlClient(database);
  await sql`
    insert into public.audit_events (home_id, actor, kind, payload)
    values (
      ${homeId}, 'host', 'memory_forgotten',
      ${JSON.stringify({ partyId, ...result })}::text::jsonb
    )
  `;

  return result;
}

/**
 * Erases one actor's memory without an audit row: every record under
 * `/parties/<actorId>` and every event in every session of the actor.
 * Each list is read to the end before anything is deleted, so a next token
 * that is an offset cannot skip items that a deletion moved forward.
 */
export async function forgetActorMemory(
  client: MemoryClient,
  memoryId: string,
  actorId: string,
): Promise<ForgetPartyMemoryResult> {
  const recordIds = (
    await listAllPages((nextToken) =>
      client.listMemoryRecords({
        memoryId,
        namespacePath: `/parties/${actorId}`,
        nextToken,
      }),
    )
  ).map((record) => record.memoryRecordId);
  for (let start = 0; start < recordIds.length; start += 100) {
    await client.batchDeleteMemoryRecords({
      memoryId,
      memoryRecordIds: recordIds.slice(start, start + 100),
    });
  }

  const sessionIds = await listAllPages((nextToken) =>
    client.listSessions({ memoryId, actorId, nextToken }),
  );
  const events: { sessionId: string; eventId: string }[] = [];
  for (const sessionId of sessionIds) {
    const eventIds = await listAllPages((nextToken) =>
      client.listEvents({ memoryId, actorId, sessionId, nextToken }),
    );
    events.push(...eventIds.map((eventId) => ({ sessionId, eventId })));
  }
  for (const { sessionId, eventId } of events) {
    await client.deleteEvent({ memoryId, actorId, sessionId, eventId });
  }

  return { deletedRecords: recordIds.length, deletedEvents: events.length };
}
