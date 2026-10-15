import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { MemoryClient } from "@/core/memory/client";

import {
  forgetSyntheticMemory,
  SYNTHETIC_HOME_ID,
  SYNTHETIC_PARTIES,
} from "./forget-synthetic-memory";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("forgetSyntheticMemory", () => {
  afterAll(() => sql.end());

  it("erases both synthetic parties' records and events and audits each erase", async () => {
    const [existingHome] = await sql<{ id: string }[]>`
      select id from public.homes where id = ${SYNTHETIC_HOME_ID}
    `;
    if (!existingHome) {
      await sql`
        insert into public.homes (id, name, timezone)
        values (${SYNTHETIC_HOME_ID}, 'Forget memory test', 'Europe/Madrid')
      `;
    }
    const namespaces: string[] = [];
    const deletedEvents: string[] = [];
    const client: MemoryClient = {
      createEvent: async () => {
        throw new Error("forget must never write memory");
      },
      listMemoryRecords: async ({ namespacePath }) => {
        namespaces.push(namespacePath);
        return {
          items: [
            {
              memoryRecordId: `record-${namespacePath}`,
              text: "fact",
              createdAt: new Date(),
            },
          ],
        };
      },
      batchDeleteMemoryRecords: async () => undefined,
      listSessions: async ({ actorId }) => ({ items: [`session-${actorId}`] }),
      listEvents: async ({ actorId }) => ({ items: [`event-${actorId}`] }),
      deleteEvent: async ({ eventId }) => {
        deletedEvents.push(eventId);
      },
    };
    const started = new Date();
    try {
      const forgotten = await forgetSyntheticMemory(
        { MEMORY_ID: "mem-test", AWS_REGION: "us-east-1", DATABASE_URL: url },
        client,
      );
      expect(forgotten.map(({ name }) => name)).toEqual([
        "Familia Vega",
        "The Parkers",
      ]);
      for (const party of SYNTHETIC_PARTIES) {
        const actorId = `home-${SYNTHETIC_HOME_ID}/party-${party.id}`;
        expect(namespaces).toContain(`/parties/${actorId}`);
        expect(deletedEvents).toContain(`event-${actorId}`);
      }
      const audits = await sql<{ party_id: string }[]>`
        select payload->>'partyId' as party_id from public.audit_events
        where home_id = ${SYNTHETIC_HOME_ID} and kind = 'memory_forgotten'
          and created_at >= ${started}
      `;
      expect(audits.map(({ party_id }) => party_id).sort()).toEqual(
        SYNTHETIC_PARTIES.map(({ id }) => id).sort(),
      );
    } finally {
      await sql`
        delete from public.audit_events
        where home_id = ${SYNTHETIC_HOME_ID} and kind = 'memory_forgotten'
          and created_at >= ${started}
      `;
      if (!existingHome) {
        await sql`delete from public.homes where id = ${SYNTHETIC_HOME_ID}`;
      }
    }
  });
});
