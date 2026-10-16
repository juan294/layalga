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
 * homes, or the synthetic parties the real-use conversion deleted. Reports
 * only by default; `--apply` deletes. It fails closed when the homes read is
 * empty, and `--apply` also fails closed without the real household or when
 * `DATABASE_URL` does not name the `--project-ref` project. Run after
 * production probe runs (see `docs/release/e2e-pro-playbook.md`).
 */
export function parseForgetOrphansArguments(argv: readonly string[]): {
  apply: boolean;
  projectRef?: string;
} {
  let apply = false;
  let projectRef: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    // pnpm passes the `--` separator through to the script.
    if (argument === "--") continue;
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--project-ref") {
      projectRef = argv[index + 1];
      if (!projectRef || projectRef.startsWith("--")) {
        throw new Error("--project-ref needs a value");
      }
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (apply && !projectRef) {
    throw new Error("--apply needs --project-ref <ref>");
  }
  return projectRef ? { apply, projectRef } : { apply };
}

/**
 * With `--apply`, `DATABASE_URL` must name the given Supabase project: as
 * the user `<role>.<ref>` on a Supabase pooler host, or the direct host
 * `db.<ref>.supabase.co`.
 * A local or other database that also holds the real household would pass
 * the homes guards, and every real party missing from it would look deleted.
 */
export function assertApplyTarget(
  env: Readonly<Record<string, string | undefined>>,
  { apply, projectRef }: { apply: boolean; projectRef?: string },
): void {
  if (!apply) return;
  const url = new URL(requiredEnvironment("DATABASE_URL", env));
  const user = decodeURIComponent(url.username);
  if (
    !projectRef ||
    !(
      (user.endsWith(`.${projectRef}`) &&
        url.hostname.endsWith(".pooler.supabase.com")) ||
      url.hostname === `db.${projectRef}.supabase.co`
    )
  ) {
    throw new Error(
      `DATABASE_URL does not name Supabase project ${projectRef ?? "(none)"}; refusing to delete.`,
    );
  }
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
    `Read ${result.homesRead} home(s) and ${result.partiesRead} party record(s).`,
    summary,
    ...unparsed,
    ...result.orphanHomeIds.map(
      (homeId) => `Home with orphaned memory: ${homeId}`,
    ),
  ];
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  Promise.resolve()
    .then(() => {
      const options = parseForgetOrphansArguments(process.argv.slice(2));
      assertApplyTarget(process.env, options);
      return forgetOrphanedMemoryFromEnvironment(process.env, options);
    })
    .then((result) => {
      for (const line of describeOrphanCleanup(result)) console.log(line);
    })
    .catch((error: unknown) => {
      console.error(safeErrorMessage(error));
      process.exitCode = 1;
    });
}
