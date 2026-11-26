import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { searchPublicStays } from "../src/core/booking/public-stay-search";
import { submitStayRequest } from "../src/core/booking/stay-requests";
import { closeDatabase } from "../src/core/db/client";
import { REAL_HOUSEHOLD_HOME_ID } from "../src/core/memory/orphans";
import { callTool } from "../src/mcp/tools";
import { fixtureStay } from "../src/test-support/fixture-household";
import {
  localAdmin,
  localSupabase,
  localWebDatabaseUrl,
} from "../src/test-support/local-supabase";

import {
  createPilotHousehold,
  prepareCreation,
  prepareRemoval,
  recordPath,
  removePilotHousehold,
  type PilotRecord,
} from "./pilot-household";

const APP = "http://127.0.0.1:3048";
const local = localSupabase();
const admin = localAdmin();
// The command runs with the rights of the web runtime, as in production.
const web = postgres(localWebDatabaseUrl(), {
  max: 1,
  prepare: false,
  max_pipeline: 1,
});
let records: string;
const created: string[] = [];
const users: string[] = [];

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", localWebDatabaseUrl());
  records = mkdtempSync(join(tmpdir(), "pilot-records-"));
});
afterEach(async () => {
  // A failed test must not leave its household behind.
  for (const homeId of created.splice(0))
    await admin`delete from public.homes where id = ${homeId} and name = ${`Pilot household ${homeId}`}`;
  for (const id of users.splice(0))
    await admin`delete from auth.users where id = ${id}`;
});
afterAll(async () => {
  rmSync(records, { recursive: true, force: true });
  vi.unstubAllEnvs();
  await closeDatabase();
  await Promise.all([admin, web].map((sql) => sql.end({ timeout: 5 })));
});

const command = () => ({ target: "local" as const, records });

/** Every row of the real household that the command could touch. */
async function realHousehold() {
  const [snapshot] = await admin<{ rows: unknown }[]>`
    select json_build_object(
      'home', (select row_to_json(h) from public.homes h where id = ${REAL_HOUSEHOLD_HOME_ID}),
      'rooms', (select json_agg(r order by r.id) from public.rooms r where home_id = ${REAL_HOUSEHOLD_HOME_ID}),
      'hosts', (select json_agg(h order by h.id) from public.hosts h where home_id = ${REAL_HOUSEHOLD_HOME_ID}),
      'claims', (select json_agg(c order by c.host_id) from public.host_identity_claims c where home_id = ${REAL_HOUSEHOLD_HOME_ID}),
      'listing', (select row_to_json(l) from public.household_public_listings l where home_id = ${REAL_HOUSEHOLD_HOME_ID}),
      'requests', (select count(*) from public.stay_requests where home_id = ${REAL_HOUSEHOLD_HOME_ID})
    ) as rows
  `;
  return snapshot!.rows;
}

const readRecord = (homeId: string) =>
  JSON.parse(readFileSync(recordPath(records, homeId), "utf8")) as PilotRecord;

async function guest() {
  const id = randomUUID();
  const email = `pilot-guest-${id}@fixture.example.invalid`;
  await admin`insert into auth.users (id, email, email_confirmed_at, aud, role)
    values (${id}, ${email}, now(), 'authenticated', 'authenticated')`;
  users.push(id);
  return { userId: id, email };
}

describe("pilot household on the local stack", { timeout: 60_000 }, () => {
  it("creates, lists, searches and removes only its own household", async () => {
    expect(local.databaseUrl).toMatch(/127\.0\.0\.1/);
    const real = await realHousehold();
    expect(real).toMatchObject({ home: { id: REAL_HOUSEHOLD_HOME_ID } });
    const now = new Date();

    prepareCreation(command());
    const record = await createPilotHousehold(web, command(), { now });
    created.push(record.homeId);

    // The record is the command's marker: private, created, 14 days.
    const file = recordPath(records, record.homeId);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readRecord(record.homeId)).toEqual(record);
    expect(record).toMatchObject({
      status: "created",
      target: "local",
      projectRef: null,
      marker: `Pilot household ${record.homeId}`,
    });
    expect(Date.parse(record.removeBy) - now.getTime()).toBe(14 * 86_400_000);
    expect(() => prepareCreation(command())).toThrow(record.homeId);

    // Synthetic rows only, and no host who can sign in.
    const [rows] = await admin`
      select
        (select name from public.homes where id = ${record.homeId}) as name,
        (select count(*)::int from public.rooms where home_id = ${record.homeId}) as rooms,
        (select count(*)::int from public.rooms where home_id = ${record.homeId} and inventory_state = 'available') as available,
        (select json_agg(json_build_object('name', display_name, 'auth', auth_user_id)) from public.hosts where home_id = ${record.homeId}) as hosts,
        (select count(*)::int from public.host_identity_claims where home_id = ${record.homeId}) as claims,
        (select count(*)::int from public.parties where home_id = ${record.homeId}) as parties,
        (select count(*)::int from public.invitations where home_id = ${record.homeId}) as invitations,
        (select row_to_json(l) from (select display_name, published, handle from public.household_public_listings where home_id = ${record.homeId}) l) as listing
    `;
    expect(rows).toEqual({
      name: record.marker,
      rooms: 3,
      available: 2,
      hosts: [{ name: "Pilot host", auth: null }],
      claims: 0,
      parties: 0,
      invitations: 0,
      listing: {
        display_name: record.displayName,
        published: true,
        handle: record.handle,
      },
    });

    // The assistant tools see it as a guest would.
    const pilotGuest = await guest();
    const context = {
      appUrl: APP,
      access: { status: "ok" as const, userId: pilotGuest.userId },
    };
    const found = await callTool(
      "find_households",
      { name: record.displayName },
      context,
    );
    expect(found.status).toBe("success");
    expect(found.structuredContent).toMatchObject({
      households: [{ handle: record.handle, name: record.displayName }],
    });
    const [from, to] = fixtureStay(now, 0, 2);
    const criteria = { from, to, nights: 2, adults: 2, children: 0, pets: 0 };
    const stays = await callTool(
      "search_stays",
      { handle: record.handle, ...criteria },
      context,
    );
    expect(stays.status).toBe("success");
    const answer = stays.structuredContent as {
      rooms: { name: string }[];
      stays: unknown[];
    };
    expect(answer.stays.length).toBeGreaterThan(0);
    expect(answer.rooms.map((room) => room.name).sort()).toEqual([
      "Garage Room",
      "Guest Room",
    ]);
    expect(JSON.stringify([found, stays])).not.toContain(record.homeId);

    // A pending request, as the pilot guest sends one on the website.
    const [offer] = (await searchPublicStays(record.handle!, criteria)).options;
    const sent = await submitStayRequest(pilotGuest, {
      handle: record.handle!,
      criteria,
      roomRefs: offer!.recommendedRoomRefs,
      overflowConsent: false,
      notes: "",
      requests: "",
      locale: "en",
      idempotencyKey: randomUUID(),
    });
    expect(sent.status).toBe("pending");
    const status = await callTool("read_request_status", {}, context);
    expect(status.status).toBe("success");
    expect(JSON.stringify(status.structuredContent)).toContain(
      record.displayName,
    );

    // Removal by id, through the record.
    const owned = { ...command(), homeId: record.homeId };
    expect(prepareRemoval(owned)).toEqual(record);
    const removed = await removePilotHousehold(web, owned, {
      now: new Date(),
    });
    expect(removed).toMatchObject({
      status: "removed",
      removedHousehold: true,
    });
    expect(readRecord(record.homeId).status).toBe("removed");
    const [left] = await admin`
      select
        (select count(*)::int from public.homes where id = ${record.homeId} or name like 'Pilot household %') as homes,
        (select count(*)::int from public.household_public_listings where handle = ${record.handle}) as listings,
        (select count(*)::int from public.stay_requests where home_id = ${record.homeId}) as requests,
        (select count(*)::int from public.rooms where home_id = ${record.homeId}) as rooms
    `;
    expect(left).toEqual({ homes: 0, listings: 0, requests: 0, rooms: 0 });
    expect(
      (await callTool("find_households", { name: record.displayName }, context))
        .status,
    ).toBe("none");
    expect(() =>
      prepareRemoval({ ...command(), homeId: record.homeId }),
    ).toThrow(/removed/);
    expect(await realHousehold()).toEqual(real);
    expect(() => prepareCreation(command())).not.toThrow();
  });

  it("leaves a pending record removable when the transaction fails", async () => {
    const homeId = randomUUID();
    // A row with the same id makes the insert fail after the record is written.
    await admin`insert into public.homes (id, name, timezone, pets_together_allowed, max_families_with_children)
      values (${homeId}, 'Unrelated household', 'Europe/Madrid', false, 1)`;
    try {
      await expect(
        createPilotHousehold(web, command(), { now: new Date(), homeId }),
      ).rejects.toThrow(/remove --home/);
      expect(readRecord(homeId).status).toBe("pending");
      // The id now belongs to a household that the command did not create.
      await expect(
        removePilotHousehold(
          web,
          { ...command(), homeId },
          { now: new Date() },
        ),
      ).rejects.toThrow(/not the pilot household/);
      expect(
        (await admin`select name from public.homes where id = ${homeId}`)[0],
      ).toEqual({ name: "Unrelated household" });
      expect(readRecord(homeId).status).toBe("pending");
    } finally {
      await admin`delete from public.homes where id = ${homeId} and name = 'Unrelated household'`;
    }
    // Without the other row, the pending record removes nothing and closes.
    const removed = await removePilotHousehold(
      web,
      { ...command(), homeId },
      { now: new Date() },
    );
    expect(removed).toMatchObject({
      status: "removed",
      removedHousehold: false,
    });
    expect(existsSync(recordPath(records, homeId))).toBe(true);
  });
});
