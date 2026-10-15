import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { MemoryInventoryClient } from "@/core/memory/client";

import {
  describeOrphanCleanup,
  forgetOrphanedMemoryFromEnvironment,
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

  it("accepts only --apply", () => {
    expect(parseForgetOrphansArguments([])).toEqual({ apply: false });
    expect(parseForgetOrphansArguments(["--apply"])).toEqual({ apply: true });
    expect(() => parseForgetOrphansArguments(["--force"])).toThrow(
      "Unknown argument: --force",
    );
  });

  it("reports on a dry run and deletes only the deleted home's memory with --apply", async () => {
    const liveHomeId = randomUUID();
    const goneHomeId = randomUUID();
    const liveActor = `home-${liveHomeId}/party-${randomUUID()}`;
    const goneActor = `home-${goneHomeId}/party-${randomUUID()}`;
    const env = {
      MEMORY_ID: "mem-test",
      AWS_REGION: "us-east-1",
      DATABASE_URL: url,
    };
    await sql`
      insert into public.homes (id, name, timezone)
      values (${liveHomeId}, 'Orphan memory test', 'Europe/Madrid')
    `;
    try {
      const dryRun = fakeMemory([liveActor, goneActor]);
      const reported = await forgetOrphanedMemoryFromEnvironment(
        env,
        { apply: false },
        dryRun.client,
      );
      expect(reported).toEqual({
        applied: false,
        orphanActorIds: [goneActor],
        orphanHomeIds: [goneHomeId],
        deletedRecords: 0,
        deletedEvents: 0,
      });
      expect(dryRun.deletedRecordIds).toEqual([]);
      expect(dryRun.deletedEventActors).toEqual([]);
      expect(describeOrphanCleanup(reported)).toEqual([
        "Dry run: 1 orphaned actor(s) across 1 deleted home(s). Nothing was deleted; rerun with --apply to delete.",
        `Orphaned home: ${goneHomeId}`,
      ]);

      const applied = fakeMemory([liveActor, goneActor]);
      const result = await forgetOrphanedMemoryFromEnvironment(
        env,
        { apply: true },
        applied.client,
      );
      expect(result).toMatchObject({
        applied: true,
        orphanHomeIds: [goneHomeId],
        deletedRecords: 1,
        deletedEvents: 1,
      });
      expect(applied.deletedRecordIds).toEqual([`record-${goneActor}`]);
      expect(applied.deletedEventActors).toEqual([goneActor]);
      expect(describeOrphanCleanup(result)[0]).toBe(
        "Forgot 1 record(s) and 1 event(s) for 1 orphaned actor(s) across 1 deleted home(s).",
      );
    } finally {
      await sql`delete from public.homes where id = ${liveHomeId}`;
    }
  });
});
