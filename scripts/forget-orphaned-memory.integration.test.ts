import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { MemoryInventoryClient } from "@/core/memory/client";
import { REAL_HOUSEHOLD_HOME_ID } from "@/core/memory/orphans";

import {
  describeOrphanCleanup,
  forgetOrphanedMemoryFromEnvironment,
  assertApplyTarget,
  parseForgetOrphansArguments,
} from "./forget-orphaned-memory";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

function fakeMemory(actorIds: string[]) {
  const deletedRecordIds: string[] = [];
  const deletedEventActors: string[] = [];
  const client: MemoryInventoryClient = {
    createEvent: async () => {
      throw new Error("orphan cleanup must never write memory");
    },
    listActors: async () => ({ items: actorIds }),
    listMemoryRecords: async ({ namespacePath }) => ({
      items: actorIds
        .filter((actorId) => `/parties/${actorId}`.startsWith(namespacePath))
        .map((actorId) => ({
          memoryRecordId: `record-${actorId}`,
          text: "fact",
          createdAt: new Date(),
          namespaces: [`/parties/${actorId}/facts`],
        })),
    }),
    batchDeleteMemoryRecords: async ({ memoryRecordIds }) => {
      deletedRecordIds.push(...memoryRecordIds);
    },
    listSessions: async ({ actorId }) => ({ items: [`session-${actorId}`] }),
    listEvents: async ({ actorId }) => ({ items: [`event-${actorId}`] }),
    deleteEvent: async ({ actorId }) => {
      deletedEventActors.push(actorId);
    },
  };
  return { client, deletedRecordIds, deletedEventActors };
}

describe("forget-orphaned-memory script", () => {
  afterAll(() => sql.end());

  it("accepts --apply only together with --project-ref", () => {
    expect(parseForgetOrphansArguments([])).toEqual({ apply: false });
    expect(
      parseForgetOrphansArguments(["--", "--apply", "--project-ref", "abc"]),
    ).toEqual({ apply: true, projectRef: "abc" });
    expect(() => parseForgetOrphansArguments(["--apply"])).toThrow(
      "--apply needs --project-ref <ref>",
    );
    expect(() => parseForgetOrphansArguments(["--project-ref"])).toThrow(
      "--project-ref needs a value",
    );
    expect(() => parseForgetOrphansArguments(["--force"])).toThrow(
      "Unknown argument: --force",
    );
  });

  it("reports on a dry run and deletes only memory of deleted homes and parties with --apply", async () => {
    const liveHomeId = randomUUID();
    const goneHomeId = randomUUID();
    const livePartyId = randomUUID();
    const liveActor = `home-${liveHomeId}/party-${livePartyId}`;
    const goneActor = `home-${goneHomeId}/party-${randomUUID()}`;
    // A party deleted from a home that still exists.
    const deletedPartyActor = `home-${liveHomeId}/party-${randomUUID()}`;
    const orphanActors = [goneActor, deletedPartyActor].sort();
    const orphanHomes = orphanActors.map((actorId) =>
      actorId === goneActor ? goneHomeId : liveHomeId,
    );
    const env = {
      MEMORY_ID: "mem-test",
      AWS_REGION: "us-east-1",
      DATABASE_URL: url,
    };
    await sql`
      insert into public.homes (id, name, timezone)
      values (${liveHomeId}, 'Orphan memory test', 'Europe/Madrid')
    `;
    await sql`
      insert into public.parties (id, home_id, family_name, locale)
      values (${livePartyId}, ${liveHomeId}, 'Orphan memory test', 'en')
    `;
    // --apply requires the real household; the seeded local database has it.
    const [realHousehold] = await sql`
      select id from public.homes where id = ${REAL_HOUSEHOLD_HOME_ID}
    `;
    if (!realHousehold) {
      await sql`
        insert into public.homes (id, name, timezone)
        values (${REAL_HOUSEHOLD_HOME_ID}, 'Orphan memory test', 'Europe/Madrid')
      `;
    }
    try {
      const dryRun = fakeMemory([liveActor, goneActor, deletedPartyActor]);
      const reported = await forgetOrphanedMemoryFromEnvironment(
        env,
        { apply: false },
        dryRun.client,
      );
      expect(reported.homesRead).toBeGreaterThanOrEqual(2);
      expect(reported).toEqual({
        applied: false,
        homesRead: reported.homesRead,
        partiesRead: reported.partiesRead,
        recordsSeen: 3,
        unparsedRecords: 0,
        orphanActorIds: orphanActors,
        orphanHomeIds: orphanHomes,
        deletedRecords: 0,
        deletedEvents: 0,
      });
      expect(dryRun.deletedRecordIds).toEqual([]);
      expect(dryRun.deletedEventActors).toEqual([]);
      expect(describeOrphanCleanup(reported)).toEqual([
        `Read ${reported.homesRead} home(s) and ${reported.partiesRead} party record(s).`,
        "Dry run: 2 orphaned actor(s) across 2 home(s). Nothing was deleted; rerun with --apply to delete.",
        ...orphanHomes.map((homeId) => `Home with orphaned memory: ${homeId}`),
      ]);

      const applied = fakeMemory([liveActor, goneActor, deletedPartyActor]);
      const result = await forgetOrphanedMemoryFromEnvironment(
        env,
        { apply: true },
        applied.client,
      );
      expect(result).toMatchObject({
        applied: true,
        orphanHomeIds: orphanHomes,
        deletedRecords: 2,
        deletedEvents: 2,
      });
      expect(applied.deletedRecordIds).toEqual(
        orphanActors.map((actorId) => `record-${actorId}`),
      );
      expect(applied.deletedEventActors).toEqual(orphanActors);
      expect(describeOrphanCleanup(result)[1]).toBe(
        "Forgot 2 record(s) and 2 event(s) for 2 orphaned actor(s) across 2 home(s).",
      );
    } finally {
      await sql`delete from public.homes where id = ${liveHomeId}`;
      if (!realHousehold) {
        await sql`delete from public.homes where id = ${REAL_HOUSEHOLD_HOME_ID}`;
      }
    }
  });

  it("applies only against the named Supabase project", () => {
    const pooler =
      "postgresql://layalga_agent.prodref:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
    const direct =
      "postgresql://postgres:secret@db.prodref.supabase.co:5432/postgres";
    expect(() =>
      assertApplyTarget(
        { DATABASE_URL: pooler },
        { apply: true, projectRef: "prodref" },
      ),
    ).not.toThrow();
    expect(() =>
      assertApplyTarget(
        { DATABASE_URL: direct },
        { apply: true, projectRef: "prodref" },
      ),
    ).not.toThrow();
    expect(() =>
      assertApplyTarget(
        { DATABASE_URL: url },
        { apply: true, projectRef: "prodref" },
      ),
    ).toThrow("DATABASE_URL does not name Supabase project prodref");
    expect(() =>
      assertApplyTarget(
        { DATABASE_URL: pooler },
        { apply: true, projectRef: "other" },
      ),
    ).toThrow("DATABASE_URL does not name Supabase project other");
    expect(() =>
      assertApplyTarget({ DATABASE_URL: url }, { apply: false }),
    ).not.toThrow();
  });

  it("warns when listed records could not be attributed to a party", () => {
    expect(
      describeOrphanCleanup({
        applied: false,
        homesRead: 3,
        partiesRead: 4,
        recordsSeen: 5,
        unparsedRecords: 2,
        orphanActorIds: [],
        orphanHomeIds: [],
        deletedRecords: 0,
        deletedEvents: 0,
      }),
    ).toEqual([
      "Read 3 home(s) and 4 party record(s).",
      "Dry run: 0 orphaned actor(s) across 0 home(s). Nothing was deleted; rerun with --apply to delete.",
      "Warning: 2 of 5 listed memory record(s) have no home-<uuid>/party-<uuid> namespace and were not checked.",
    ]);
  });
});
