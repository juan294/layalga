import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PostgresStorage } from "./postgres-storage";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
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
});
