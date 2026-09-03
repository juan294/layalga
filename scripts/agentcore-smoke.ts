import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import postgres from "postgres";

import { AgentCoreClient } from "../src/agent/client";
import { DEMO_SEED } from "./seed-demo";
import { drainAndCollectTerminalRunResults } from "./release-probes";
import {
  cleanupTaggedRunArtifacts,
  isDirectExecution,
  markerSuffix,
  requiredEnvironment,
  safeErrorMessage,
} from "./release-helpers";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;

interface SmokeRunResult {
  runId: string;
  status: "completed" | "interrupted" | "failed";
  executedOn?: "local" | "agentcore";
  summary: string;
}

export async function runAgentCoreSmoke(): Promise<SmokeRunResult> {
  const runtimeArn = requiredEnvironment("AGENTCORE_RUNTIME_ARN");
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  requiredEnvironment("LINK_TOKEN_SECRET");
  const region = process.env.AWS_REGION?.trim() || "us-east-1";
  if (process.env.AGENT_RUNTIME !== "agentcore") {
    throw new Error(
      'AGENT_RUNTIME must be "agentcore" for the AgentCore smoke test',
    );
  }
  if (!process.env.APP_URL) {
    throw new Error("APP_URL is required for the AgentCore smoke test");
  }

  const sql = postgres(databaseUrl, { prepare: false, max: 2 });
  const marker = `agentcore-smoke:${randomUUID()}`;
  const suffix = markerSuffix(marker);
  const host = DEMO_SEED.hosts[0];
  const rawMessage = `Smoke check: a synthetic family is asking about a September weekend visit.${suffix}`;

  try {
    const client = new AgentCoreClient(runtimeArn, region);
    const queued = await client.enqueue({
      task: "host_capture",
      homeId: DEMO_SEED.home.id,
      hostId: host.id,
      rawMessage,
      locale: "en",
    });
    assert.equal(
      queued.status,
      "queued",
      `AgentCore smoke run did not queue: ${queued.status}`,
    );

    const [terminal] = await drainAndCollectTerminalRunResults(
      [queued.runId],
      async () => {},
      (runIds) => sql`
        select id, status, result
        from public.runs
        where id = any(${sql.array([...runIds])}::uuid[])
      `,
      { pollMs: POLL_INTERVAL_MS, timeoutMs: POLL_TIMEOUT_MS },
    );
    assert.ok(terminal, "AgentCore smoke run result is missing");
    assert.equal(
      terminal.status,
      "completed",
      `AgentCore smoke run ended with status "${terminal.status}": ${terminal.summary}`,
    );
    assert.equal(
      terminal.executedOn,
      "agentcore",
      `AgentCore smoke run executed on "${terminal.executedOn ?? "unknown"}", expected "agentcore"`,
    );

    return terminal;
  } finally {
    try {
      await cleanupTaggedRunArtifacts(sql, DEMO_SEED.home.id, suffix, {
        extraSessionIds: [`capture_${host.id}`],
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

async function main(): Promise<void> {
  const result = await runAgentCoreSmoke();
  console.log(JSON.stringify(result));
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
