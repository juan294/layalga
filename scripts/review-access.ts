import { pathToFileURL } from "node:url";

import postgres from "postgres";

import type { ReviewAccessMode } from "../src/lib/review-access";

const DEFAULT_LOOKBACK_MS = 48 * 60 * 60 * 1_000;

interface ReviewAccessRow {
  access_mode: ReviewAccessMode;
  locale: "en" | "es";
  created_at: Date | string;
}

export interface ReviewAccessReport {
  since: string;
  generatedAt: string;
  total: number;
  byMode: Record<ReviewAccessMode, number>;
  events: Array<{
    accessMode: ReviewAccessMode;
    locale: "en" | "es";
    createdAt: string;
  }>;
}

export function parseSince(argv: readonly string[], now = new Date()): Date {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  if (args.length === 0) {
    return new Date(now.getTime() - DEFAULT_LOOKBACK_MS);
  }
  if (args.length !== 2 || args[0] !== "--since") {
    throw new Error("Usage: pnpm review:access -- --since <ISO timestamp>");
  }
  const since = new Date(args[1]);
  if (Number.isNaN(since.getTime())) {
    throw new Error("--since must be a valid ISO timestamp");
  }
  return since;
}

export function buildReviewAccessReport(
  rows: readonly ReviewAccessRow[],
  since: Date,
  generatedAt = new Date(),
): ReviewAccessReport {
  const byMode = { guest: 0, host: 0 };
  const events = rows.map((row) => {
    byMode[row.access_mode] += 1;
    return {
      accessMode: row.access_mode,
      locale: row.locale,
      createdAt: new Date(row.created_at).toISOString(),
    };
  });
  return {
    since: since.toISOString(),
    generatedAt: generatedAt.toISOString(),
    total: rows.length,
    byMode,
    events,
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const since = parseSince(process.argv.slice(2));
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    const rows = await sql<ReviewAccessRow[]>`
      select access_mode, locale, created_at
      from private.review_access_events
      where created_at >= ${since.toISOString()}
      order by created_at desc
    `;
    console.log(JSON.stringify(buildReviewAccessReport(rows, since), null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
