import "@/core/server-only";

import { sqlClient, type DatabaseClient } from "@/core/db/client";

import { createMemoryClient, type MemoryClient } from "./client";

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
  const actorId = `home-${homeId}/party-${partyId}`;
  const namespacePath = `/parties/${actorId}`;

  const deletedRecords = await deleteAllMemoryRecords(
    client,
    memoryId,
    namespacePath,
  );
  const deletedEvents = await deleteAllEvents(client, memoryId, actorId);

  const sql = sqlClient(database);
  await sql`
    insert into public.audit_events (home_id, actor, kind, payload)
    values (
      ${homeId}, 'host', 'memory_forgotten',
      ${JSON.stringify({ partyId, deletedRecords, deletedEvents })}::text::jsonb
    )
  `;

  return { deletedRecords, deletedEvents };
}

async function deleteAllMemoryRecords(
  client: MemoryClient,
  memoryId: string,
  namespacePath: string,
): Promise<number> {
  let deleted = 0;
  let nextToken: string | undefined;
  do {
    const page = await client.listMemoryRecords({
      memoryId,
      namespacePath,
      nextToken,
    });
    const ids = page.items.map((record) => record.memoryRecordId);
    for (let start = 0; start < ids.length; start += 100) {
      const batch = ids.slice(start, start + 100);
      await client.batchDeleteMemoryRecords({
        memoryId,
        memoryRecordIds: batch,
      });
      deleted += batch.length;
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return deleted;
}

async function deleteAllEvents(
  client: MemoryClient,
  memoryId: string,
  actorId: string,
): Promise<number> {
  let deleted = 0;
  let sessionsToken: string | undefined;
  do {
    const sessions = await client.listSessions({
      memoryId,
      actorId,
      nextToken: sessionsToken,
    });
    for (const sessionId of sessions.items) {
      let eventsToken: string | undefined;
      do {
        const events = await client.listEvents({
          memoryId,
          actorId,
          sessionId,
          nextToken: eventsToken,
        });
        for (const eventId of events.items) {
          await client.deleteEvent({ memoryId, actorId, sessionId, eventId });
          deleted += 1;
        }
        eventsToken = events.nextToken;
      } while (eventsToken);
    }
    sessionsToken = sessions.nextToken;
  } while (sessionsToken);
  return deleted;
}
