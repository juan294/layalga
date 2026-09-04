import "@/core/server-only";

import { sqlClient, type DatabaseClient } from "@/core/db/client";
import { createMemoryClient, type MemoryClient } from "@/core/memory/client";

export interface HostMemoryRecordItem {
  id: string;
  text: string;
  createdAt: Date;
}

export interface HostMemoryPartyRecords {
  partyId: string;
  partyName: string;
  records: HostMemoryRecordItem[];
}

/**
 * Lists remembered records for every party of the home that has at least
 * one invitation, so the "what L'Ayalga remembers" host panel can show a
 * party even when it currently has no records. One `ListMemoryRecords` call
 * (paginated) per party's own namespace subtree
 * (`/parties/home-<homeId>/party-<partyId>`), matching the read scope
 * `memoryStoresForTask` gives a matched host_capture or guest task.
 */
export async function loadHostMemoryPanel(
  database: DatabaseClient,
  homeId: string,
  memoryId: string,
  region: string,
  client: MemoryClient = createMemoryClient(region),
): Promise<HostMemoryPartyRecords[]> {
  const sql = sqlClient(database);
  const parties = await sql<{ id: string; family_name: string }[]>`
    select distinct party.id, party.family_name
    from public.parties party
    join public.invitations invitation on invitation.party_id = party.id
    where party.home_id = ${homeId}
    order by party.family_name
  `;

  return Promise.all(
    parties.map(async (party) => ({
      partyId: party.id,
      partyName: party.family_name,
      records: await listAllRecords(
        client,
        memoryId,
        `/parties/home-${homeId}/party-${party.id}`,
      ),
    })),
  );
}

async function listAllRecords(
  client: MemoryClient,
  memoryId: string,
  namespacePath: string,
): Promise<HostMemoryRecordItem[]> {
  const items: HostMemoryRecordItem[] = [];
  let nextToken: string | undefined;
  do {
    const page = await client.listMemoryRecords({
      memoryId,
      namespacePath,
      nextToken,
    });
    for (const record of page.items) {
      items.push({
        id: record.memoryRecordId,
        text: record.text,
        createdAt: record.createdAt,
      });
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
