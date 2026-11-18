import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, expect, it, vi } from "vitest";
import { createFixtureHousehold } from "@/test-support/fixture-household";
import { closeDatabase } from "@/core/db/client";
vi.mock("server-only", () => ({}));
import { captureHistory, creatorCapture } from "./capture-history";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
afterAll(async () => {
  await closeDatabase();
  await sql.end();
});

it("pages captures newest first by authenticated creator and returns only run references", async () => {
  const home = await createFixtureHousehold(sql, {
    label: "Capture history " + randomUUID(),
    tokenSecret: process.env.LINK_TOKEN_SECRET!,
    parties: [],
    hosts: 2,
  });
  try {
    const [owner, cohost] = home.hostIds;
    const records: string[] = [];
    for (let index = 0; index < 7; index++) {
      const hostId = index === 6 ? cohost! : owner!;
      const id = randomUUID();
      await sql`insert into public.runs(id,home_id,session_id,task,status,started_at,payload)
       values (${id},${home.homeId},${"capture_" + hostId},'host_capture','failed',${new Date(Date.UTC(2026, 0, 1, index))},${sql.json({ task: "host_capture", hostId, homeId: home.homeId, rawMessage: "Private draft", locale: "en" })})`;
      records.push(id);
    }
    const host = { id: owner!, homeId: home.homeId };
    const newest = await captureHistory(host, undefined);
    expect(newest.more).toBe(true);
    expect(newest.rows.map((row) => row.id)).toEqual(
      records.slice(1, 6).reverse(),
    );
    expect(Object.keys(newest.rows[0]!).sort()).toEqual([
      "id",
      "retryable",
      "started_at",
      "status",
    ]);
    const older = await captureHistory(host, "1");
    expect(older.more).toBe(false);
    expect(older.rows.map((row) => row.id)).toEqual(records.slice(0, 1));
    expect(await creatorCapture(host, records[6]!)).toBeUndefined();
    expect(
      await creatorCapture({ ...host, homeId: randomUUID() }, records[0]!),
    ).toBeUndefined();
    expect((await captureHistory(host, "invalid")).page).toBe(0);
  } finally {
    await home.cleanup();
  }
});
