import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import postgres, { type Sql } from "postgres";
import { z } from "zod";

import {
  setPublicListing,
  validListingName,
} from "../src/core/booking/public-listings";
import { REAL_HOUSEHOLD_HOME_ID } from "../src/core/memory/orphans";
import {
  insertFixtureHome,
  removeFixtureHousehold,
} from "../src/test-support/fixture-household";
import {
  connectionTarget,
  databaseNamesProject,
  isDirectExecution,
  isLoopbackDatabase,
  requiredEnvironment,
  safeErrorMessage,
} from "./release-helpers";

/**
 * Creates the synthetic published household of the assistant pilot (gate G6
 * of `docs/release/assistant-access-activation.md`) and removes it later, by
 * id. Every run needs an explicit target and acknowledgement. The record
 * file is the command's marker: removal refuses any id without one, before
 * it connects. Nothing reads or writes the real household or any household
 * that the command did not create.
 */

export const CREATE_ACKNOWLEDGEMENT = "WRITE PILOT HOUSEHOLD";
export const REMOVE_ACKNOWLEDGEMENT = "REMOVE PILOT HOUSEHOLD";
export const PILOT_LIFETIME_DAYS = 14;
const PRODUCTION_ROLE = "layalga_web";

type Target = "local" | "production";
interface Scope {
  target: Target;
  projectRef?: string;
  records: string;
}
export type PilotCommand =
  | ({ action: "create" } & Scope)
  | ({ action: "remove"; homeId: string } & Scope);

const uuid = z.uuid();

const pilotRecord = z.object({
  kind: z.literal("layalga-pilot-household"),
  version: z.literal(1),
  status: z.enum(["pending", "created", "removed"]),
  homeId: uuid,
  marker: z.string(),
  displayName: z.string(),
  handle: uuid.nullable(),
  target: z.enum(["local", "production"]),
  projectRef: z.string().nullable(),
  createdAt: z.iso.datetime(),
  removeBy: z.iso.datetime(),
  removedAt: z.iso.datetime().optional(),
});
export type PilotRecord = z.infer<typeof pilotRecord>;

const ACKNOWLEDGEMENTS = {
  create: CREATE_ACKNOWLEDGEMENT,
  remove: REMOVE_ACKNOWLEDGEMENT,
} as const;
const VALUE_FLAGS = new Set([
  "--target",
  "--acknowledge",
  "--records",
  "--project-ref",
  "--home",
]);

export function parsePilotArguments(argv: readonly string[]): PilotCommand {
  const [action, ...rest] = argv.filter((argument) => argument !== "--");
  if (action !== "create" && action !== "remove")
    throw new Error("The first argument must be create or remove");
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]!;
    const value = rest[index + 1];
    if (!VALUE_FLAGS.has(flag)) throw new Error(`Unknown argument: ${flag}`);
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${flag} needs a value`);
    if (values.has(flag)) throw new Error(`${flag} is given twice`);
    values.set(flag, value);
  }

  const target = values.get("--target");
  if (target !== "local" && target !== "production")
    throw new Error('--target must be "local" or "production"');
  if (values.get("--acknowledge") !== ACKNOWLEDGEMENTS[action])
    throw new Error(
      `--acknowledge must equal "${ACKNOWLEDGEMENTS[action]}" for ${action}`,
    );
  const records = values.get("--records");
  if (!records) throw new Error("--records <folder> is required");
  const projectRef = values.get("--project-ref");
  if (target === "production" && !projectRef)
    throw new Error("--target production needs --project-ref <ref>");
  if (target === "local" && projectRef)
    throw new Error("--project-ref is only for --target production");
  const scope: Scope = { target, records, ...(projectRef && { projectRef }) };

  const homeId = values.get("--home");
  if (action === "create") {
    if (homeId) throw new Error("create chooses its own id; omit --home");
    return { action, ...scope };
  }
  if (!homeId || !uuid.safeParse(homeId).success)
    throw new Error("remove needs --home <pilot household id>");
  assertNotRealHousehold(homeId);
  return { action, homeId: homeId.toLowerCase(), ...scope };
}

/** The connection must belong to the target: loopback, or the named project. */
export function assertPilotTarget(
  { target, projectRef }: Pick<Scope, "target" | "projectRef">,
  databaseUrl: string,
): void {
  if (target === "local") {
    if (!isLoopbackDatabase(databaseUrl))
      throw new Error("--target local needs a loopback DATABASE_URL");
    return;
  }
  if (!projectRef || !databaseNamesProject(databaseUrl, projectRef))
    throw new Error(
      `DATABASE_URL does not name Supabase project ${projectRef ?? "(none)"}; refusing.`,
    );
  // The non-owner web runtime login, never the database owner.
  const { user } = connectionTarget(databaseUrl);
  if (user !== PRODUCTION_ROLE && user !== `${PRODUCTION_ROLE}.${projectRef}`)
    throw new Error(
      `--target production connects as ${PRODUCTION_ROLE}, the web runtime login; refusing ${user}`,
    );
}

/** The internal name carries the full id; the listed name is short and synthetic. */
export function pilotIdentity(homeId: string) {
  return {
    marker: `Pilot household ${homeId}`,
    displayName: `Pilot household ${homeId.slice(0, 6).toUpperCase()}`,
  };
}

export const recordPath = (records: string, homeId: string) =>
  join(records, `pilot-household-${homeId}.json`);

function readRecord(path: string): PilotRecord {
  try {
    return pilotRecord.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    throw new Error(`The pilot household record ${path} cannot be read`);
  }
}

/** Written whole and then renamed, so a crash leaves the previous record. */
function writeRecord(records: string, record: PilotRecord): void {
  const path = recordPath(records, record.homeId);
  const next = `${path}.next`;
  writeFileSync(next, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(next, path);
}

/** One pilot household at a time in a records folder. */
export function prepareCreation({ records }: Pick<Scope, "records">): void {
  if (!existsSync(records)) return;
  for (const name of readdirSync(records)) {
    if (!/^pilot-household-.*\.json$/.test(name)) continue;
    const record = readRecord(join(records, name));
    if (record.status !== "removed")
      throw new Error(
        `Pilot household ${record.homeId} is ${record.status}; remove it before creating another`,
      );
  }
}

/** Reads and checks the command's own record. It never connects. */
export function prepareRemoval(
  command: Scope & { homeId: string },
): PilotRecord {
  assertNotRealHousehold(command.homeId);
  const path = recordPath(command.records, command.homeId);
  if (!existsSync(path))
    throw new Error(
      `No pilot household record for ${command.homeId} in ${command.records}; refusing to remove`,
    );
  const record = readRecord(path);
  if (
    record.homeId !== command.homeId ||
    record.marker !== pilotIdentity(record.homeId).marker
  )
    throw new Error(`The record ${path} is not for ${command.homeId}`);
  if (
    record.target !== command.target ||
    record.projectRef !== (command.projectRef ?? null)
  )
    throw new Error(
      `Pilot household ${record.homeId} belongs to target ${record.target}${record.projectRef ? ` and project ${record.projectRef}` : ""}, not to this target or project`,
    );
  if (record.status === "removed")
    throw new Error(
      `Pilot household ${record.homeId} was already removed at ${record.removedAt}`,
    );
  return record;
}

export async function createPilotHousehold(
  sql: Sql,
  { target, projectRef, records }: Scope,
  { now, homeId = randomUUID() }: { now: Date; homeId?: string },
): Promise<PilotRecord> {
  assertNotRealHousehold(homeId);
  const { marker, displayName } = pilotIdentity(homeId);
  if (!validListingName(displayName)) throw new Error("Invalid listed name");
  const pending: PilotRecord = {
    kind: "layalga-pilot-household",
    version: 1,
    status: "pending",
    homeId,
    marker,
    displayName,
    handle: null,
    target,
    projectRef: projectRef ?? null,
    createdAt: now.toISOString(),
    removeBy: new Date(
      now.getTime() + PILOT_LIFETIME_DAYS * 86_400_000,
    ).toISOString(),
  };
  mkdirSync(records, { recursive: true, mode: 0o700 });
  // The record exists before any row, so every row has an owner on disk.
  writeRecord(records, pending);

  let handle: string;
  try {
    handle = await sql.begin(async (transaction) => {
      // No Auth user and no identity claim: nobody can sign in as this host.
      const { hostIds } = await insertFixtureHome(transaction, {
        label: marker,
        homeId,
        hostNames: ["Pilot host"],
      });
      await setPublicListing(
        { id: hostIds[0]!, homeId },
        { published: true, displayName },
        transaction,
      );
      const [listing] = await transaction<{ handle: string }[]>`
        select handle from public.household_public_listings
        where home_id = ${homeId}
      `;
      return listing!.handle;
    });
  } catch (error) {
    throw new Error(
      `Pilot household ${homeId} was not created (${safeErrorMessage(error).split("\n")[0]}). Its record stays pending; close it with: remove --home ${homeId}`,
      { cause: error },
    );
  }
  const created: PilotRecord = { ...pending, status: "created", handle };
  writeRecord(records, created);
  return created;
}

/** Removes the household of the command's own record, by id and marker. */
export async function removePilotHousehold(
  sql: Sql,
  command: Scope & { homeId: string },
  { now }: { now: Date },
): Promise<
  PilotRecord & { removedHousehold: boolean; removedStayRequests: number }
> {
  const record = prepareRemoval(command);
  // The id is the command's own; its name proves that the row is too.
  const [row] = await sql<{ name: string }[]>`
    select name from public.homes where id = ${record.homeId}
  `;
  if (row && row.name !== record.marker)
    throw new Error(
      `Home ${record.homeId} is not the pilot household; nothing was removed`,
    );
  let removedStayRequests = 0;
  if (row) {
    // Anyone signed in can find the listing, so requests may not be the
    // pilot guest's. A request needs a published listing, so none arrives
    // after this update and the count is complete.
    await sql`
      update public.household_public_listings set published = false
      where home_id = ${record.homeId}
    `;
    const [requests] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.stay_requests
      where home_id = ${record.homeId}
    `;
    removedStayRequests = requests!.count;
    await removeFixtureHousehold(sql, record.homeId, record.marker);
  }
  const removed: PilotRecord = {
    ...record,
    status: "removed",
    removedAt: now.toISOString(),
  };
  writeRecord(command.records, removed);
  return {
    ...removed,
    removedHousehold: Boolean(row),
    removedStayRequests,
  };
}

function assertNotRealHousehold(homeId: string): void {
  if (homeId.toLowerCase() === REAL_HOUSEHOLD_HOME_ID)
    throw new Error("The real household is never a pilot household");
}

/** The command line: every refusal comes before the database connection. */
export async function runPilotCommand(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const command = parsePilotArguments(argv);
  const databaseUrl = requiredEnvironment("DATABASE_URL", env);
  assertPilotTarget(command, databaseUrl);
  // Both checks read only the records folder.
  if (command.action === "remove") prepareRemoval(command);
  else prepareCreation(command);
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    max_pipeline: 1,
  });
  try {
    const result =
      command.action === "remove"
        ? await removePilotHousehold(sql, command, { now: new Date() })
        : await createPilotHousehold(sql, command, { now: new Date() });
    return { ...result, record: recordPath(command.records, result.homeId) };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  runPilotCommand(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: unknown) => {
      console.error(safeErrorMessage(error));
      process.exitCode = 1;
    });
}
