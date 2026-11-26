import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REAL_HOUSEHOLD_HOME_ID } from "../src/core/memory/orphans";
import { validListingName } from "../src/core/booking/public-listings";

import {
  CREATE_ACKNOWLEDGEMENT,
  REMOVE_ACKNOWLEDGEMENT,
  assertPilotTarget,
  parsePilotArguments,
  pilotIdentity,
  prepareCreation,
  prepareRemoval,
  recordPath,
  runPilotCommand,
  type PilotRecord,
} from "./pilot-household";

const HOME = "3f6c1a2b-7d4e-4f10-9a8b-1c2d3e4f5a6b";
const REF = "abcdefghijklmnopqrst";
let records: string;

beforeEach(() => {
  records = mkdtempSync(join(tmpdir(), "pilot-records-"));
});
afterEach(() => rmSync(records, { recursive: true, force: true }));

const create = (...extra: string[]) => [
  "create",
  "--target",
  "local",
  "--acknowledge",
  CREATE_ACKNOWLEDGEMENT,
  "--records",
  records,
  ...extra,
];
const remove = (...extra: string[]) => [
  "remove",
  "--target",
  "local",
  "--acknowledge",
  REMOVE_ACKNOWLEDGEMENT,
  "--records",
  records,
  "--home",
  HOME,
  ...extra,
];

function record(change: Partial<PilotRecord> = {}): PilotRecord {
  return {
    kind: "layalga-pilot-household",
    version: 1,
    status: "created",
    homeId: HOME,
    ...pilotIdentity(HOME),
    handle: null,
    target: "local",
    projectRef: null,
    createdAt: "2026-11-26T12:00:00.000Z",
    removeBy: "2026-12-10T12:00:00.000Z",
    ...change,
  };
}

const save = (value: unknown, homeId = HOME) =>
  writeFileSync(recordPath(records, homeId), JSON.stringify(value));

describe("parsePilotArguments", () => {
  it("reads a local creation and removal", () => {
    expect(parsePilotArguments(["--", ...create()])).toEqual({
      action: "create",
      target: "local",
      records,
    });
    expect(parsePilotArguments(remove())).toEqual({
      action: "remove",
      target: "local",
      records,
      homeId: HOME,
    });
  });

  it("needs a project for production and refuses one for local", () => {
    const production = [
      ...create().map((value) => (value === "local" ? "production" : value)),
    ];
    expect(() => parsePilotArguments(production)).toThrow(/--project-ref/);
    expect(
      parsePilotArguments([...production, "--project-ref", REF]),
    ).toMatchObject({ target: "production", projectRef: REF });
    expect(() => parsePilotArguments(create("--project-ref", REF))).toThrow(
      /--project-ref/,
    );
  });

  it.each([
    ["no action", () => create().slice(1)],
    ["an unknown action", () => ["delete", ...create().slice(1)]],
    ["no target", () => create().filter((_, i) => i !== 1 && i !== 2)],
    [
      "another target",
      () => create().map((v) => (v === "local" ? "staging" : v)),
    ],
    ["no acknowledgement", () => create().filter((_, i) => i !== 3 && i !== 4)],
    [
      "the removal acknowledgement on creation",
      () =>
        create().map((v) =>
          v === CREATE_ACKNOWLEDGEMENT ? REMOVE_ACKNOWLEDGEMENT : v,
        ),
    ],
    [
      "the creation acknowledgement on removal",
      () =>
        remove().map((v) =>
          v === REMOVE_ACKNOWLEDGEMENT ? CREATE_ACKNOWLEDGEMENT : v,
        ),
    ],
    [
      "an acknowledgement in another case",
      () =>
        create().map((v) =>
          v === CREATE_ACKNOWLEDGEMENT ? v.toLowerCase() : v,
        ),
    ],
    ["no records folder", () => create().filter((_, i) => i !== 5 && i !== 6)],
    ["a home on creation", () => create("--home", HOME)],
    ["no home on removal", () => remove().slice(0, -2)],
    [
      "a home that is not a UUID",
      () => remove().map((v) => (v === HOME ? "not-a-uuid" : v)),
    ],
    [
      "the real household",
      () => remove().map((v) => (v === HOME ? REAL_HOUSEHOLD_HOME_ID : v)),
    ],
    ["an unknown argument", () => create("--force")],
    ["a flag without its value", () => [...create(), "--records"]],
  ])("refuses %s", (_name, argv) => {
    expect(() => parsePilotArguments(argv())).toThrow();
  });
});

describe("assertPilotTarget", () => {
  const local = { target: "local" as const };
  const production = { target: "production" as const, projectRef: REF };

  it("accepts a loopback database for local", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]"])
      expect(() =>
        assertPilotTarget(local, `postgresql://u:p@${host}:55922/postgres`),
      ).not.toThrow();
  });

  it("refuses a hosted database for local", () => {
    expect(() =>
      assertPilotTarget(
        local,
        `postgresql://layalga_web.${REF}:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      ),
    ).toThrow(/loopback/);
  });

  it("accepts the pooler and the direct host of the named project", () => {
    for (const url of [
      `postgresql://layalga_web.${REF}:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      `postgresql://layalga_web:p@db.${REF}.supabase.co:5432/postgres`,
    ])
      expect(() => assertPilotTarget(production, url)).not.toThrow();
  });

  it.each([
    "postgresql://u:p@127.0.0.1:55922/postgres",
    "postgresql://layalga_web.otherprojectref0000:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    `postgresql://layalga_web.${REF}:p@pooler.example.com:6543/postgres`,
    `postgresql://layalga_web:p@db.${REF}.supabase.co.example.com:5432/postgres`,
  ])("refuses %s for production", (url) => {
    expect(() => assertPilotTarget(production, url)).toThrow(
      /does not name Supabase project/,
    );
  });
});

describe("pilotIdentity", () => {
  it("marks the internal name with the full id and lists a short synthetic name", () => {
    const { marker, displayName } = pilotIdentity(HOME);
    expect(marker).toBe(`Pilot household ${HOME}`);
    expect(displayName).toBe("Pilot household 3F6C1A");
    expect(validListingName(displayName)).toBe(true);
  });
});

describe("prepareCreation", () => {
  it("starts in an empty folder or beside removed records", () => {
    expect(() => prepareCreation({ records })).not.toThrow();
    save(record({ status: "removed" }));
    expect(() => prepareCreation({ records })).not.toThrow();
  });

  it.each(["pending", "created"] as const)(
    "refuses while a %s record exists",
    (status) => {
      save(record({ status }));
      expect(() => prepareCreation({ records })).toThrow(HOME);
    },
  );

  it("refuses a record that it cannot read", () => {
    writeFileSync(recordPath(records, HOME), "{");
    expect(() => prepareCreation({ records })).toThrow(/record/);
  });
});

describe("prepareRemoval", () => {
  const command = { target: "local" as const, records, homeId: HOME };

  it("returns the command's own record", () => {
    save(record());
    expect(prepareRemoval({ ...command, records })).toEqual(record());
  });

  it("refuses when the record is missing", () => {
    save(record({ homeId: "4f6c1a2b-7d4e-4f10-9a8b-1c2d3e4f5a6b" }), HOME);
    expect(() =>
      prepareRemoval({
        ...command,
        records,
        homeId: "5f6c1a2b-7d4e-4f10-9a8b-1c2d3e4f5a6b",
      }),
    ).toThrow(/No pilot household record/);
  });

  it.each<[string, Partial<PilotRecord> | Record<string, unknown>]>([
    ["another home", { homeId: "4f6c1a2b-7d4e-4f10-9a8b-1c2d3e4f5a6b" }],
    ["another marker", { marker: "Casa Ayalga" }],
    ["another kind", { kind: "release-probe" }],
    ["another target", { target: "production", projectRef: REF }],
    ["an already removed household", { status: "removed" }],
  ])("refuses a record of %s", (_name, change) => {
    save({ ...record(), ...change });
    expect(() => prepareRemoval({ ...command, records })).toThrow();
  });

  it("refuses a production removal of another project", () => {
    save(record({ target: "production", projectRef: REF }));
    expect(() =>
      prepareRemoval({
        target: "production",
        projectRef: "otherprojectref0000",
        records,
        homeId: HOME,
      }),
    ).toThrow(/project/);
    expect(
      prepareRemoval({
        target: "production",
        projectRef: REF,
        records,
        homeId: HOME,
      }).projectRef,
    ).toBe(REF);
  });

  it("refuses the real household even with a record", () => {
    save(record({ homeId: REAL_HOUSEHOLD_HOME_ID }), REAL_HOUSEHOLD_HOME_ID);
    expect(() =>
      prepareRemoval({
        ...command,
        records,
        homeId: REAL_HOUSEHOLD_HOME_ID,
      }),
    ).toThrow(/real household/);
  });

  it("never changes the record", () => {
    save(record());
    const before = readFileSync(recordPath(records, HOME), "utf8");
    prepareRemoval({ ...command, records });
    expect(readFileSync(recordPath(records, HOME), "utf8")).toBe(before);
  });
});

describe("runPilotCommand", () => {
  // Nothing listens on port 1: a connection attempt would fail differently.
  const env = { DATABASE_URL: "postgresql://nobody@127.0.0.1:1/none" };

  it("refuses a removal without the record before it connects", async () => {
    await expect(runPilotCommand(remove(), env)).rejects.toThrow(
      /No pilot household record/,
    );
  });

  it("refuses a second creation before it connects", async () => {
    save(record({ status: "pending" }));
    await expect(runPilotCommand(create(), env)).rejects.toThrow(
      /remove it before creating another/,
    );
  });

  it("refuses a production run on a loopback database before it connects", async () => {
    const production = [
      ...create().map((value) => (value === "local" ? "production" : value)),
      "--project-ref",
      REF,
    ];
    await expect(runPilotCommand(production, env)).rejects.toThrow(
      /does not name Supabase project/,
    );
  });

  it("needs DATABASE_URL", async () => {
    await expect(runPilotCommand(create(), {})).rejects.toThrow(
      /DATABASE_URL is required/,
    );
  });
});
