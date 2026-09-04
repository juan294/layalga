import { pathToFileURL } from "node:url";

import postgres from "postgres";

import { createMemoryClient, type MemoryClient } from "@/core/memory/client";
import { forgetPartyMemory } from "@/core/memory/forget";
import { DEMO_SEED } from "@/lib/demo/reset";

/**
 * Writes (or, with `--forget`, erases) household memory for the seeded
 * Vega party (`DEMO_SEED.parties[0]`), so the video can show recall on a
 * second Vega invitation without a write-then-read race: this script seeds
 * memory before recording, and `--forget` clears it before a fresh take.
 * Party ids are stable across `resetDemoHome`, so this survives demo resets.
 *
 * Never writes a family name into the event text (D7): every seeded fact
 * reads as household preference, not identity.
 */
const VEGA_HOME_ID = DEMO_SEED.home.id;
const VEGA_PARTY_ID = DEMO_SEED.parties[0].id;
const SEED_SESSION_ID = "seed_memory_vega";

const SEED_FACTS: readonly { token: string; text: string }[] = [
  {
    token: "seed-memory-vega-ground-floor",
    text: "This family prefers the ground floor room.",
  },
  {
    token: "seed-memory-vega-late-friday",
    text: "This family usually arrives late on Friday evenings.",
  },
  {
    token: "seed-memory-vega-small-dog",
    text: "This family travels with one small dog.",
  },
];

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export async function seedMemory(
  options: { forget?: boolean } = {},
  client: MemoryClient = createMemoryClient(requiredEnvironment("AWS_REGION")),
): Promise<void> {
  const memoryId = requiredEnvironment("MEMORY_ID");
  const region = process.env.AWS_REGION ?? "us-east-1";
  const actorId = `home-${VEGA_HOME_ID}/party-${VEGA_PARTY_ID}`;

  if (options.forget) {
    const databaseUrl = requiredEnvironment("DATABASE_URL");
    const sql = postgres(databaseUrl, { prepare: false, max: 1 });
    try {
      const result = await forgetPartyMemory(
        sql,
        VEGA_HOME_ID,
        VEGA_PARTY_ID,
        memoryId,
        region,
        client,
      );
      console.log(
        `Forgot ${result.deletedRecords} record(s) and ${result.deletedEvents} event(s) for the seeded Vega party.`,
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
    return;
  }

  for (const fact of SEED_FACTS) {
    await client.createEvent({
      memoryId,
      actorId,
      sessionId: SEED_SESSION_ID,
      eventTimestamp: new Date(),
      text: fact.text,
      clientToken: fact.token,
    });
  }
  console.log(`Wrote ${SEED_FACTS.length} event(s) for the seeded Vega party.`);

  await waitForExtraction(client, memoryId, `/parties/${actorId}`);
}

/**
 * Polls `ListMemoryRecords` until at least one long-term record exists
 * (extraction from the seeded events is asynchronous and its latency is
 * not documented), printing elapsed time so the caller can see progress
 * rather than a silent wait.
 */
async function waitForExtraction(
  client: MemoryClient,
  memoryId: string,
  namespacePath: string,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const page = await client.listMemoryRecords({ memoryId, namespacePath });
    const elapsedSeconds = Math.round((Date.now() - start) / 1000);
    if (page.items.length > 0) {
      console.log(
        `Extraction produced ${page.items.length} record(s) after ${elapsedSeconds}s.`,
      );
      return;
    }
    console.log(
      `Waiting for extraction... (${elapsedSeconds}s elapsed, polling every ${POLL_INTERVAL_MS / 1000}s)`,
    );
    await sleep(POLL_INTERVAL_MS);
  }
  const elapsedSeconds = Math.round((Date.now() - start) / 1000);
  console.warn(
    `Timed out waiting for extraction after ${elapsedSeconds}s; records may still appear later.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const forget = process.argv.slice(2).includes("--forget");
  await seedMemory({ forget });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
