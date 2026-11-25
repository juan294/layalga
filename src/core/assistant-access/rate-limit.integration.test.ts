import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { localAdmin, localSupabase } from "@/test-support/assistant-oauth";

import { takeRequest } from "./rate-limit";

const db = postgres(localSupabase().databaseUrl, { max: 2, prepare: false });
const web = localAdmin("layalga_web_runtime");
const pool = postgres(localSupabase().adminUrl, {
  max: 12,
  prepare: false,
  connection: { role: "layalga_web_runtime" },
});
const START = new Date("2026-11-25T12:00:00Z");
const at = (seconds: number) => new Date(START.getTime() + seconds * 1000);

let user: string;
let client: string;
const subjects = () => [`account:${user}:${client}`, `client:${client}`];
const seed = (
  subject: string,
  span: string,
  requests: number,
  startedAt = START,
) =>
  db`insert into public.assistant_request_windows(subject,span,started_at,requests)
    values(${subject},${span},${startedAt},${requests})
    on conflict (subject,span) do update set started_at=excluded.started_at, requests=excluded.requests`;
const counts = async () =>
  Object.fromEntries(
    (
      await db<{ name: string; requests: number }[]>`
        select split_part(subject,':',1) || ':' || span as name, requests
        from public.assistant_request_windows where subject in ${db(subjects())}`
    ).map((row) => [row.name, row.requests]),
  );

beforeEach(() => {
  user = randomUUID();
  client = randomUUID();
});
afterAll(async () => {
  await db`delete from public.assistant_request_windows where started_at >= ${at(-200_000)} and started_at < ${at(200_000)}`;
  await Promise.all([db, web, pool].map((sql) => sql.end({ timeout: 5 })));
});

describe("takeRequest", () => {
  it("counts the first request in each window", async () => {
    expect(await takeRequest(web, user, client, START)).toEqual({
      allowed: true,
    });
    expect(await counts()).toEqual({
      "account:minute": 1,
      "account:day": 1,
      "client:minute": 1,
    });
  });

  it("allows 60 requests in a minute, refuses the next and starts again", async () => {
    for (let count = 1; count <= 60; count += 1)
      expect(await takeRequest(web, user, client, at(10)), `${count}`).toEqual({
        allowed: true,
      });
    expect(await takeRequest(web, user, client, at(30))).toEqual({
      allowed: false,
      retryAfter: 40,
    });
    expect(await takeRequest(web, user, client, at(69.5))).toEqual({
      allowed: false,
      retryAfter: 1,
    });
    expect(await takeRequest(web, user, client, at(70))).toEqual({
      allowed: true,
    });
    expect((await counts())["account:minute"]).toBe(1);
  });

  it("allows 1,000 requests in 24 hours from the first request", async () => {
    await seed(`account:${user}:${client}`, "day", 999);
    expect(await takeRequest(web, user, client, at(86_000))).toEqual({
      allowed: true,
    });
    expect(await takeRequest(web, user, client, at(86_100))).toEqual({
      allowed: false,
      retryAfter: 300,
    });
    expect(await takeRequest(web, user, client, at(86_400))).toEqual({
      allowed: true,
    });
    expect((await counts())["account:day"]).toBe(1);
  });

  it("waits for every exceeded account window", async () => {
    await seed(`account:${user}:${client}`, "minute", 60);
    expect(await takeRequest(web, user, client, at(20))).toEqual({
      allowed: false,
      retryAfter: 40,
    });
    await seed(`account:${user}:${client}`, "day", 1_000);
    expect(await takeRequest(web, user, client, at(20))).toEqual({
      allowed: false,
      retryAfter: 86_380,
    });
  });

  it("limits a client across its users", async () => {
    await seed(`client:${client}`, "minute", 1_199);
    expect(await takeRequest(web, user, client, at(20))).toEqual({
      allowed: true,
    });
    user = randomUUID();
    expect(await takeRequest(web, user, client, at(20))).toEqual({
      allowed: false,
      retryAfter: 40,
    });
    expect(await takeRequest(web, user, client, at(60))).toEqual({
      allowed: true,
    });
  });

  it.each(["minute", "day"])(
    "does not spend the client window when the account %s window refuses",
    async (span) => {
      await seed(`client:${client}`, "minute", 5);
      await seed(`account:${user}:${client}`, span, 1_000);
      expect(await takeRequest(web, user, client, at(1))).toMatchObject({
        allowed: false,
      });
      expect((await counts())["client:minute"]).toBe(5);
    },
  );

  it("counts concurrent requests of several users exactly, without a deadlock", async () => {
    const users = [user, randomUUID(), randomUUID()];
    const results = await Promise.all(
      Array.from({ length: 210 }, (_, index) =>
        takeRequest(pool, users[index % 3]!, client, at(5)),
      ),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(180);
    expect(await counts()).toMatchObject({
      "account:minute": 70,
      "client:minute": 180,
    });
    await db`delete from public.assistant_request_windows where subject like ${`account:%:${client}`}`;
  });
});
