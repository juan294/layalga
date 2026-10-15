import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixtureHousehold } from "../src/test-support/fixture-household";
import {
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
        health: async ({ runId }) => {
          labels = probeHomeLabels(runId);
          expect(await homesNamed(labels)).toBe(2);
          return "stubbed health";
        },
        "host-capture": async () => {
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
