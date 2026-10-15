import postgres from "postgres";

import {
  createMemoryClient,
  type MemoryInventoryClient,
} from "@/core/memory/client";
import {
  forgetOrphanedMemory,
  type ForgetOrphanedMemoryResult,
} from "@/core/memory/orphans";

import {
  isDirectExecution,
  requiredEnvironment,
  safeErrorMessage,
} from "./release-helpers";

/**
 * Forgets AgentCore Memory whose party no longer exists, such as the fixture
 * parties a production probe run writes before its cleanup deletes their
 * homes, or the synthetic parties the real-use conversion deleted. Reports only by default; `--apply` deletes. It fails closed when
 * the homes read is empty, and `--apply` also fails closed without the real
 * household. Run after production probe runs (see
 * `docs/release/e2e-pro-playbook.md`).
 */
export function parseForgetOrphansArguments(argv: readonly string[]): {
  apply: boolean;
} {
  for (const argument of argv) {
    // pnpm passes the `--` separator through to the script.
    if (argument !== "--" && argument !== "--apply") {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { apply: argv.includes("--apply") };
}

export async function forgetOrphanedMemoryFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  { apply }: { apply: boolean },
  client?: MemoryInventoryClient,
): Promise<ForgetOrphanedMemoryResult> {
  const memoryId = requiredEnvironment("MEMORY_ID", env);
  const region = requiredEnvironment("AWS_REGION", env);
  const sql = postgres(requiredEnvironment("DATABASE_URL", env), {
    prepare: false,
    max: 1,
  });
  try {
    return await forgetOrphanedMemory(
      sql,
      memoryId,
      client ?? createMemoryClient(region),
      { apply },
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function describeOrphanCleanup(
  result: ForgetOrphanedMemoryResult,
): string[] {
  const scope = `${result.orphanActorIds.length} orphaned actor(s) across ${result.orphanHomeIds.length} home(s)`;
  const summary = result.applied
    ? `Forgot ${result.deletedRecords} record(s) and ${result.deletedEvents} event(s) for ${scope}.`
    : `Dry run: ${scope}. Nothing was deleted; rerun with --apply to delete.`;
  const unparsed =
    result.unparsedRecords > 0
      ? [
          `Warning: ${result.unparsedRecords} of ${result.recordsSeen} listed memory record(s) have no home-<uuid>/party-<uuid> namespace and were not checked.`,
        ]
      : [];
  return [
    `Read ${result.homesRead} existing home(s).`,
    summary,
    ...unparsed,
    ...result.orphanHomeIds.map((homeId) => `Home with orphaned memory: ${homeId}`),
  ];
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  Promise.resolve()
    .then(() =>
      forgetOrphanedMemoryFromEnvironment(
        process.env,
        parseForgetOrphansArguments(process.argv.slice(2)),
      ),
    )
    .then((result) => {
      for (const line of describeOrphanCleanup(result)) console.log(line);
    })
    .catch((error: unknown) => {
      console.error(safeErrorMessage(error));
      process.exitCode = 1;
    });
}
