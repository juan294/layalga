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

/**
 * Deletes every record under `namespacePath` (a prefix); returns the count.
 * Every page is listed before anything is deleted, so a next token that is
 * an offset cannot skip records that a deletion moved forward.
 */
export async function deleteAllMemoryRecords(
  client: MemoryClient,
  memoryId: string,
  namespacePath: string,
): Promise<number> {
  const ids: string[] = [];
  let nextToken: string | undefined;
  do {
    const page = await client.listMemoryRecords({
      memoryId,
      namespacePath,
      nextToken,
    });
    ids.push(...page.items.map((record) => record.memoryRecordId));
    nextToken = page.nextToken;
  } while (nextToken);

  let deleted = 0;
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    const result = await client.batchDeleteMemoryRecords({
      memoryId,
      memoryRecordIds: batch,
    });
    deleted += typeof result === "number" ? result : batch.length;
  }
  return deleted;
}

/**
 * Deletes every event in every session of `actorId`; returns the count.
 * Like `deleteAllMemoryRecords`, it lists everything before deleting.
 */
export async function deleteAllEvents(
  client: MemoryClient,
  memoryId: string,
  actorId: string,
): Promise<number> {
  const sessionIds: string[] = [];
  let sessionsToken: string | undefined;
  do {
    const sessions = await client.listSessions({
      memoryId,
      actorId,
      nextToken: sessionsToken,
    });
    sessionIds.push(...sessions.items);
    sessionsToken = sessions.nextToken;
  } while (sessionsToken);

  const events: { sessionId: string; eventId: string }[] = [];
  for (const sessionId of sessionIds) {
    let eventsToken: string | undefined;
    do {
      const page = await client.listEvents({
        memoryId,
        actorId,
        sessionId,
        nextToken: eventsToken,
      });
      events.push(...page.items.map((eventId) => ({ sessionId, eventId })));
      eventsToken = page.nextToken;
    } while (eventsToken);
  }

  for (const { sessionId, eventId } of events) {
    await client.deleteEvent({ memoryId, actorId, sessionId, eventId });
  }
  return events.length;
}
