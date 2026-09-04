import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { MemoryClient, Page } from "@/core/memory/client";

import { loadHostMemoryPanel } from "./memory-data";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("loadHostMemoryPanel", () => {
  afterAll(() => sql.end());

  it("lists every party of the home with an invitation, reading each party's own namespace", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone) values ('Memory panel test', 'Europe/Madrid')
      returning id
    `;
    const homeId = home!.id;
    const [host] = await sql<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${homeId}, 'Host', 'en') returning id
    `;
    const [vega] = await sql<{ id: string }[]>`
      insert into public.parties (home_id, family_name, locale, link_token)
      values (${homeId}, 'Familia Vega', 'es', ${crypto.randomUUID()}) returning id
    `;
    const [otero] = await sql<{ id: string }[]>`
      insert into public.parties (home_id, family_name, locale, link_token)
      values (${homeId}, 'The Oteros', 'en', ${crypto.randomUUID()}) returning id
    `;
    const [noInvitation] = await sql<{ id: string }[]>`
      insert into public.parties (home_id, family_name, locale, link_token)
      values (${homeId}, 'No invitation yet', 'en', ${crypto.randomUUID()}) returning id
    `;
    await sql`
      insert into public.invitations (home_id, host_id, party_id, raw_message)
      values
        (${homeId}, ${host!.id}, ${vega!.id}, 'Vega raw message'),
        (${homeId}, ${host!.id}, ${otero!.id}, 'Otero raw message')
    `;

    const requestedNamespaces: string[] = [];
    const recordsByNamespace: Record<
      string,
      Page<{
        memoryRecordId: string;
        text: string;
        createdAt: Date;
      }>
    > = {
      [`/parties/home-${homeId}/party-${vega!.id}`]: {
        items: [
          {
            memoryRecordId: "rec-1",
            text: "prefers the ground floor room",
            createdAt: new Date("2026-09-01T10:00:00Z"),
          },
        ],
      },
      [`/parties/home-${homeId}/party-${otero!.id}`]: { items: [] },
    };
    const fakeClient: MemoryClient = {
      createEvent: async () => undefined,
      listMemoryRecords: async ({ namespacePath }) => {
        requestedNamespaces.push(namespacePath);
        return recordsByNamespace[namespacePath] ?? { items: [] };
      },
      batchDeleteMemoryRecords: async () => undefined,
      listSessions: async () => ({ items: [] }),
      listEvents: async () => ({ items: [] }),
      deleteEvent: async () => undefined,
    };

    try {
      const result = await loadHostMemoryPanel(
        sql,
        homeId,
        "mem-test",
        "us-east-1",
        fakeClient,
      );

      expect(result.map((party) => party.partyName)).toEqual([
        "Familia Vega",
        "The Oteros",
      ]);
      expect(result.some((party) => party.partyId === noInvitation!.id)).toBe(
        false,
      );
      const vegaResult = result.find((party) => party.partyId === vega!.id);
      expect(vegaResult?.records).toEqual([
        {
          id: "rec-1",
          text: "prefers the ground floor room",
          createdAt: new Date("2026-09-01T10:00:00Z"),
        },
      ]);
      expect(requestedNamespaces).toContain(
        `/parties/home-${homeId}/party-${vega!.id}`,
      );
      expect(requestedNamespaces).toContain(
        `/parties/home-${homeId}/party-${otero!.id}`,
      );
    } finally {
      await sql`delete from public.homes where id = ${homeId}`;
    }
  });

  it("returns an empty list when no party has an invitation", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone) values ('Memory panel empty', 'Europe/Madrid')
      returning id
    `;
    const homeId = home!.id;
    const fakeClient: MemoryClient = {
      createEvent: async () => undefined,
      listMemoryRecords: async () => {
        throw new Error("must not be called with no parties");
      },
      batchDeleteMemoryRecords: async () => undefined,
      listSessions: async () => ({ items: [] }),
      listEvents: async () => ({ items: [] }),
      deleteEvent: async () => undefined,
    };
    try {
      const result = await loadHostMemoryPanel(
        sql,
        homeId,
        "mem-test",
        "us-east-1",
        fakeClient,
      );
      expect(result).toEqual([]);
    } finally {
      await sql`delete from public.homes where id = ${homeId}`;
    }
  });
});
