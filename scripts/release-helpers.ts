import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export interface DemoSnapshot {
  visits: { id: string; status: string }[];
  notifications: {
    recipient_kind: "host" | "party";
    kind: string;
  }[];
  decisions: { id: string; status: string }[];
}

export interface ReleaseCliOptions {
  baseUrl: string;
  expectedCommit?: string;
  headed: boolean;
}

export function assertDemoSnapshot(snapshot: DemoSnapshot): void {
  assert.equal(snapshot.visits.length, 2, "expected exactly two visits");
  assert.equal(
    snapshot.visits.filter((visit) => visit.status === "escalated").length,
    1,
    "expected exactly one escalated visit",
  );
  assert.equal(
    snapshot.notifications.length,
    4,
    "expected four total notifications",
  );
  assert.equal(
    snapshot.notifications.filter(
      (notification) =>
        notification.recipient_kind === "host" &&
        notification.kind === "reconfirm_escalation",
    ).length,
    2,
    "expected exactly two host escalation notifications",
  );
  assert.equal(
    snapshot.decisions.filter((decision) => decision.status === "approved")
      .length,
    1,
    "expected one approved pending decision",
  );
  assert.equal(
    snapshot.decisions.filter((decision) => decision.status === "pending")
      .length,
    0,
    "expected no unanswered pending decision",
  );
}

export function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !/^\/*$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(`Base URL must be a plain HTTP(S) origin: ${value}`);
  }
  return url.origin;
}

export function parseReleaseCliOptions(
  argv: string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReleaseCliOptions {
  let baseUrl = env.APP_URL ?? "http://127.0.0.1:3008";
  let expectedCommit = env.EXPECTED_COMMIT_SHA;
  let headed = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--headed") {
      headed = true;
      continue;
    }
    if (argument === "--base" || argument === "--commit") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === "--base") baseUrl = value;
      else expectedCommit = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    expectedCommit,
    headed,
  };
}

export async function responseJson<T>(
  response: Response,
  operation: string,
): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${operation} failed with HTTP ${response.status}: ${body.slice(0, 500)}`,
    );
  }
  return JSON.parse(body) as T;
}

export function isDirectExecution(metaUrl: string, argv1?: string): boolean {
  return Boolean(argv1 && metaUrl === pathToFileURL(argv1).href);
}

export function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  return message.replace(/[A-Za-z0-9_-]{43}/g, "[redacted]");
}

export function requiredEnvironment(
  name: "DATABASE_URL" | "LINK_TOKEN_SECRET" | "TICK_SECRET",
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
