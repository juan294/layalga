import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { getDatabaseConnection, closeDatabase } from "@/core/db/client";
import type { MemoryClient } from "@/core/memory/client";
import { findRoomOptionsTool } from "@/agent/tools/find-room-options";
import { NoopScheduler } from "@/agent/deps";
import { SystemClock } from "@/core/clock";
import { findGuestOptionsForAuthority } from "./guest-actions";

const sql = getDatabaseConnection().sql;
const criteria = {
  from: "2026-11-10",
  to: "2026-11-13",
  nights: 2,
  adults: 2,
  children: 0,
  pets: 0,
};

async function fixture() {
  const homeId = randomUUID(),
    partyId = randomUUID(),
    otherPartyId = randomUUID();
  const upperId = randomUUID(),
    groundId = randomUUID();
  await sql`insert into public.homes(id,name,timezone) values(${homeId},${`Preference ${homeId}`},'Europe/Madrid')`;
  await sql`insert into public.parties(id,home_id,family_name,locale) values(${partyId},${homeId},'Returning family','en'),(${otherPartyId},${homeId},'Different family','en')`;
  await sql`insert into public.rooms(id,home_id,name,beds,guest_label,floor_label,sleeping_arrangement,maximum_capacity,inventory_state,overflow_policy,display_order) values
    (${upperId},${homeId},'Private upstairs',2,'Upper room','Upper floor','One double bed',2,'available','none',1),
    (${groundId},${homeId},'Private downstairs',2,'Garden room','Ground floor','One sofa bed',2,'available','none',2)`;
  const authority = { id: randomUUID(), homeId, partyId };
  const namespace = `/parties/home-${homeId}/party-${partyId}`;
  // Synthetic records supplied through the same client interface used by AgentCore.
  const records = vi.fn(
    async ({ namespacePath }: { namespacePath: string }) => ({
      items:
        namespacePath === namespace
          ? [
              {
                memoryRecordId: "synthetic-preference",
                text: "This family prefers the ground floor room.",
                createdAt: new Date(),
              },
            ]
          : [],
    }),
  );
  const client: MemoryClient = {
    listMemoryRecords: records,
    createEvent: async () => {},
    batchDeleteMemoryRecords: async () => {},
    listSessions: async () => ({ items: [] }),
    listEvents: async () => ({ items: [] }),
    deleteEvent: async () => {},
  };
  return {
    homeId,
    partyId,
    otherPartyId,
    upperId,
    groundId,
    authority,
    namespace,
    records,
    client,
  };
}

describe("actual guest preference recommendations", () => {
  afterEach(() => vi.unstubAllEnvs());
  afterAll(() => closeDatabase());

  it("changes a returning two-adult family recommendation and isolates another party", async () => {
    const f = await fixture();
    try {
      const baseline = await findGuestOptionsForAuthority(
        f.authority,
        criteria,
      );
      expect(baseline.options[0]?.recommendedRoomIds).toEqual([f.upperId]);
      vi.stubEnv("MEMORY", "agentcore");
      vi.stubEnv("MEMORY_ID", "synthetic-memory");
      vi.stubEnv("AWS_REGION", "us-east-1");
      const result = await findGuestOptionsForAuthority(f.authority, criteria, {
        client: f.client,
      });
      expect(result.options).toHaveLength(2);
      expect(result.options[0]?.recommendedRoomIds).toEqual([f.groundId]);
      expect(result.options[0]?.preferenceExplanation).toMatchObject({
        status: "available",
        matched: ["ground_floor"],
        unmatched: [],
      });
      expect(f.records).toHaveBeenCalledTimes(1); // Recall once per search, not once per stay.
      expect(f.records.mock.calls[0]?.[0].namespacePath).toBe(f.namespace);
      expect(JSON.stringify(result)).not.toContain("synthetic-preference");
      expect(JSON.stringify(result)).not.toContain("Private downstairs");
      const unrelated = await findGuestOptionsForAuthority(
        { ...f.authority, partyId: f.otherPartyId },
        criteria,
        { client: f.client },
      );
      expect(unrelated.options[0]?.recommendedRoomIds).toEqual([f.upperId]);
      expect(unrelated.options[0]?.preferenceExplanation?.status).toBe("empty");
    } finally {
      await sql`delete from public.homes where id=${f.homeId}`;
    }
  });

  it("explains an unavailable preferred room while preserving feasible choices and policy denial", async () => {
    const f = await fixture();
    try {
      vi.stubEnv("MEMORY", "agentcore");
      vi.stubEnv("MEMORY_ID", "synthetic-memory");
      vi.stubEnv("AWS_REGION", "us-east-1");
      await sql`update public.rooms set inventory_state='withheld' where id=${f.groundId}`;
      const result = await findGuestOptionsForAuthority(f.authority, criteria, {
        client: f.client,
      });
      expect(result.options[0]?.recommendedRoomIds).toEqual([f.upperId]);
      expect(result.options[0]?.rooms.map((room) => room.id)).toEqual([
        f.upperId,
      ]);
      expect(result.options[0]?.preferenceExplanation).toMatchObject({
        matched: [],
        unmatched: ["ground_floor"],
      });
      const tooMany = await findGuestOptionsForAuthority(
        f.authority,
        { ...criteria, adults: 3 },
        { client: f.client },
      );
      expect(tooMany).toMatchObject({
        status: "error",
        error: "none",
        options: [],
      });
    } finally {
      await sql`delete from public.homes where id=${f.homeId}`;
    }
  });

  it("uses the same scoped recall in the actual Strands room tool without exposing raw memory", async () => {
    const f = await fixture();
    try {
      vi.stubEnv("MEMORY", "agentcore");
      vi.stubEnv("MEMORY_ID", "synthetic-memory");
      vi.stubEnv("AWS_REGION", "us-east-1");
      const deps = {
        db: sql,
        clock: new SystemClock(),
        scheduler: new NoopScheduler(),
        appUrl: "http://127.0.0.1:3008",
        locale: "en" as const,
        authority: { homeId: f.homeId, partyId: f.partyId },
        memoryClient: f.client,
      };
      const result = await findRoomOptionsTool(deps).invoke({
        stay: ["2026-11-10", "2026-11-12"],
        partySize: 2,
      });
      expect(result.recommended.map((room) => room.id)).toEqual([f.groundId]);
      expect(result.preferenceExplanation.matched).toEqual(["ground_floor"]);
      expect(JSON.stringify(result)).not.toContain("This family");
      const hostOnly = await findRoomOptionsTool({
        ...deps,
        authority: { homeId: f.homeId },
      }).invoke({ stay: ["2026-11-10", "2026-11-12"], partySize: 2 });
      expect(hostOnly.recommended.map((room) => room.id)).toEqual([f.upperId]);
      expect(f.records).toHaveBeenCalledTimes(1);
    } finally {
      await sql`delete from public.homes where id=${f.homeId}`;
    }
  });
});
