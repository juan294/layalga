import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixtureHousehold } from "../src/test-support/fixture-household";
import {
  PROBES,
  probeHomeLabels,
  removeProbeHouseholds,
  runReleaseProbes,
} from "./release-probes";
import { parseReleaseCliOptions } from "./release-helpers";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const tokenSecret = "0123456789abcdef0123456789abcdef";
const db = postgres(databaseUrl, { max: 2, prepare: false });

async function homesNamed([label, conflictLabel]: readonly [string, string]) {
  const [row] = await db<{ count: number }[]>`
    select count(*)::int as count from public.homes
    where name in (${label}, ${conflictLabel})
  `;
  return row?.count;
}

describe("release probe recovery", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.LINK_TOKEN_SECRET = tokenSecret;
    process.env.AGENT_ROUTE_SECRET ??= "agent-route-0123456789abcdef0123456789";
    process.env.TICK_SECRET ??= "fedcba9876543210fedcba9876543210";
  });

  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("cleans up after an injected probe failure and prints the recovery command", async () => {
    let labels: [string, string] | undefined;
    const report = await runReleaseProbes(
      parseReleaseCliOptions(["--target", "production"], {}),
      {
        health: async () => "stubbed health",
        "host-capture": async ({ runId }) => {
          labels = probeHomeLabels(runId);
          expect(await homesNamed(labels)).toBe(2);
          throw new Error("capture assertion failed");
        },
      },
    );
    expect(report.status).toBe("BLOCKED");
    expect(report.failure).toMatchObject({ probe: "host-capture" });
    expect(report.cleanupCommand).toBe(
      `pnpm run release:probes -- --cleanup-only ${report.runId}`,
    );
    expect(await homesNamed(labels!)).toBe(0);
  });

  it("recovers an interrupted local booking probe and preserves an unrelated account", async () => {
    const runId = randomUUID();
    const other = randomUUID();
    const email = `stay-${runId}@probe.example.invalid`;
    const fixture = await createFixtureHousehold(db, {
      label: "Self-service probe " + runId,
      tokenSecret,
      hosts: 2,
      parties: [],
    });
    try {
      await db`insert into auth.users (id,email,aud,role) values (${runId},${email},'authenticated','authenticated'),(${other},${other + "@example.invalid"},'authenticated','authenticated')`;
      expect(await removeProbeHouseholds(db, runId, true)).toBe(1);
      expect(await removeProbeHouseholds(db, runId, true)).toBe(0);
      const users = await db<
        { id: string }[]
      >`select id from auth.users where id in (${runId},${other})`;
      expect(users.map((row) => row.id)).toEqual([other]);
    } finally {
      await fixture.cleanup();
      await db`delete from auth.users where id in (${runId},${other})`;
    }
  });

  it("proves self-service submits without booking and confirms with one human decision", async () => {
    const stub = async () => "covered by its own probe";
    const report = await runReleaseProbes(
      parseReleaseCliOptions(["--target", "local"], {}),
      {
        health: stub,
        "host-capture": stub,
        "guest-confirmation": stub,
        "concurrent-conflict": stub,
        "interrupt-resume": stub,
        reconfirmation: stub,
        "room-coordination": stub,
        "guest-isolation": stub,
      },
    );
    expect(report.failure).toBeUndefined();
    expect(report.evidence).toContainEqual({
      probe: "self-service-booking",
      status: "passed",
      detail: expect.stringContaining("one host decision"),
    });
    const [remaining] = await db`select
      (select count(*)::int from public.homes where name=${"Self-service probe " + report.runId}) as homes,
      (select count(*)::int from auth.users where id=${report.runId}) as users`;
    expect(remaining).toMatchObject({ homes: 0, users: 0 });
  });

  it("runs the target's probes in the declared order", async () => {
    const ran: string[] = [];
    const record = (probe: string) => async () => {
      ran.push(probe);
      return probe;
    };
    const report = await runReleaseProbes(
      parseReleaseCliOptions(["--target", "production"], {}),
      {
        health: record("health"),
        "host-capture": record("host-capture"),
        "guest-confirmation": record("guest-confirmation"),
        "concurrent-conflict": record("concurrent-conflict"),
        "guest-isolation": record("guest-isolation"),
        "interrupt-resume": record("interrupt-resume"),
      },
    );
    expect(report.status).toBe("passed");
    expect(ran).toEqual(
      PROBES.production.filter((probe) => probe !== "cleanup"),
    );
    expect(report.evidence.map(({ probe }) => probe)).toEqual(
      PROBES.production,
    );
  });

  it("reports PAUSED when the base cannot be reached", async () => {
    const report = await runReleaseProbes(
      parseReleaseCliOptions(["--base", "http://127.0.0.1:9"], {}),
    );
    expect(report.status).toBe("PAUSED");
    expect(report.failure).toMatchObject({ probe: "health" });
    expect(await homesNamed(probeHomeLabels(report.runId))).toBe(0);
  });

  it("removes a leftover fixture household for --cleanup-only", async () => {
    const runId = randomUUID();
    const [label, conflictLabel] = probeHomeLabels(runId);
    await createFixtureHousehold(db, { label, tokenSecret });
    await createFixtureHousehold(db, { label: conflictLabel, tokenSecret });
    expect(await removeProbeHouseholds(db, runId)).toBe(2);
    expect(await homesNamed([label, conflictLabel])).toBe(0);
  });
});
