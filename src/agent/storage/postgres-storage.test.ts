import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PostgresStorage } from "./postgres-storage";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false });

describe("PostgresStorage", () => {
  beforeEach(async () => {
    await sql`truncate public.agent_sessions`;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("writes, reads, lists, deletes and namespaces bytes", async () => {
    const storage = new PostgresStorage(sql, "session-a");
    const namespaced = storage.namespace("session");
    const data = new TextEncoder().encode("snapshot");

    await namespaced.write("one/current", data);
    await namespaced.write("two/current", new Uint8Array([2]));

    expect(await namespaced.read("one/current")).toEqual(data);
    expect(await namespaced.list("one/")).toEqual(["one/current"]);
    expect(await storage.list("session/")).toEqual([
      "session/one/current",
      "session/two/current",
    ]);

    await namespaced.delete("one/current");
    expect(await namespaced.read("one/current")).toBeNull();
  });

  it("saves session state only while the run claim is current", async () => {
    const [home] = await sql<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Storage ${randomUUID()}`}, 'Europe/Madrid') returning id
    `;
    const claimToken = randomUUID();
    try {
      const [run] = await sql<{ id: string }[]>`
        insert into public.runs (
          home_id, session_id, task, status, payload, queue_claim_token,
          queue_claimed_at, heartbeat_at, deadline_at
        ) values (
          ${home!.id}, 'session-lease', 'host_capture', 'running', '{}'::jsonb,
          ${claimToken}, now(), now(), now() + interval '4 minutes'
        ) returning id
      `;
      const owner = new PostgresStorage(sql, "session-lease", "", {
        runId: run!.id,
        claimToken,
      }).namespace("session");
      const stale = new PostgresStorage(sql, "session-lease", "", {
        runId: run!.id,
        claimToken: randomUUID(),
      }).namespace("session");

      await owner.write("snapshot", new Uint8Array([1]));
      await expect(
        stale.write("snapshot", new Uint8Array([2])),
      ).rejects.toThrow("Agent run is no longer active");
      await expect(stale.delete("snapshot")).rejects.toThrow(
        "Agent run is no longer active",
      );
      expect(await owner.read("snapshot")).toEqual(new Uint8Array([1]));

      await sql`
        update public.runs set status = 'queued', queue_claim_token = null
        where id = ${run!.id}
      `;
      await expect(
        owner.write("snapshot", new Uint8Array([3])),
      ).rejects.toThrow("Agent run is no longer active");
      expect(await owner.read("snapshot")).toEqual(new Uint8Array([1]));
    } finally {
      await sql`delete from public.homes where id = ${home!.id}`;
    }
  });
});
