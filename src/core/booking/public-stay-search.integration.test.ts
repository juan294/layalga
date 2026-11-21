import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { getDatabaseConnection, closeDatabase } from "@/core/db/client";
import * as memory from "@/core/memory/room-preferences";
import { createFixtureHousehold } from "@/test-support/fixture-household";
import {
  searchPublicStays,
  resolvePublicStaySelection,
} from "./public-stay-search";

const input = {
  from: "2032-07-01",
  to: "2032-07-31",
  nights: 14,
  adults: 2,
  children: 0,
  pets: 0,
};
const exact = { ...input, to: "2032-07-15" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // It is July 1 in the fixture household, although it is still June in UTC.
  vi.setSystemTime(new Date("2032-06-30T22:30:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(() => closeDatabase());

async function listedHome() {
  const { sql } = getDatabaseConnection();
  const home = await createFixtureHousehold(sql, {
    label: `Public search ${randomUUID()}`,
    tokenSecret: "fixture-secret",
    parties: [],
  });
  onTestFinished(() => home.cleanup());
  const [listing] = await sql<{ handle: string }[]>`
    insert into public.household_public_listings(home_id,display_name,search_name,published)
    values (${home.homeId},'Lake House','lake house',true) returning handle`;
  return { ...home, handle: listing!.handle, sql };
}

it("projects only public whole-stay choices, bounds the list and reads without party memory or booking writes", async () => {
  const home = await listedHome();
  const recall = vi.spyOn(memory, "loadPartyRoomPreferences");
  const result = await searchPublicStays(home.handle, input);
  expect(Object.keys(result).sort()).toEqual([
    "options",
    "status",
    "truncated",
  ]);
  expect(result.status).toBe("success");
  expect(result.truncated).toBe(true);
  expect(result.options).toHaveLength(12);
  for (const option of result.options) {
    expect(option.confirmation).toBe("host_approval_required");
    expect(Object.keys(option).sort()).toEqual([
      "confirmation",
      "recommendedRoomRefs",
      "rooms",
      "stay",
    ]);
    expect(Date.parse(option.stay[1]) - Date.parse(option.stay[0])).toBe(
      14 * 86_400_000,
    );
    expect(option.rooms.map((room) => room.guestLabel)).toEqual([
      "Guest Room",
      "Garage Room",
    ]);
    expect(option.rooms[0]).toEqual({
      ref: expect.any(String),
      guestLabel: "Guest Room",
      floorLabel: "Upper floor",
      sleepingArrangement: "One double bed",
      overflowArrangement: null,
      standardCapacity: 2,
      maximumCapacity: 2,
    });
    expect(option.recommendedRoomRefs).toEqual([option.rooms[0]!.ref]);
  }
  expect(JSON.stringify(result)).not.toContain(home.homeId);
  for (const id of home.roomIds)
    expect(JSON.stringify(result)).not.toContain(id);
  expect(recall).not.toHaveBeenCalled();
  const [counts] = await home.sql`select
    (select count(*)::int from public.parties where home_id=${home.homeId}) as parties,
    (select count(*)::int from public.invitations where home_id=${home.homeId}) as invitations,
    (select count(*)::int from public.visits where home_id=${home.homeId}) as visits,
    (select count(*)::int from public.visit_rooms where home_id=${home.homeId}) as occupancy`;
  expect(counts).toEqual({
    parties: 0,
    invitations: 0,
    visits: 0,
    occupancy: 0,
  });
  expect(
    (await searchPublicStays(home.handle, { ...input, to: "2032-07-26" }))
      .truncated,
  ).toBe(false);
});

it("rejects invalid or past local dates and lets the guest refine an empty search", async () => {
  const home = await listedHome();
  for (const invalid of [
    { from: "2032-06-30" },
    { to: "2032-07-04" },
    { to: "2032-10-01" },
    { nights: 0 },
    { adults: 0 },
    { pets: -1 },
    { pets: null as unknown as number },
  ]) {
    expect(
      await searchPublicStays(home.handle, { ...input, ...invalid }),
    ).toEqual({ status: "invalid", options: [], truncated: false });
  }
  expect(
    await searchPublicStays(home.handle, { ...exact, adults: 12 }),
  ).toEqual({ status: "none", options: [], truncated: false });
  expect((await searchPublicStays(home.handle, exact)).status).toBe("success");
});

it("resolves only the reviewed listing, exact dates, available rooms, capacity and current overflow terms", async () => {
  const home = await listedHome();
  const other = await listedHome();
  const result = await searchPublicStays(home.handle, exact);
  const refs = result.options[0]!.recommendedRoomRefs;
  const resolve = (
    handle: string,
    query: typeof exact,
    selections: string[],
    consent = false,
  ) => resolvePublicStaySelection(handle, query, selections, consent);
  expect(await resolve(home.handle, exact, refs)).toMatchObject({
    homeId: home.homeId,
    roomIds: [home.roomIds[0]],
  });
  expect(await resolve(other.handle, exact, refs)).toBeNull();
  expect(
    await resolve(
      home.handle,
      { ...exact, from: "2032-07-02", to: "2032-07-16" },
      refs,
    ),
  ).toBeNull();
  expect(await resolve(home.handle, exact, [...refs, ...refs])).toBeNull();
  expect(await resolve(home.handle, exact, [home.roomIds[0]!])).toBeNull();
  expect(await resolve(home.handle, { ...exact, adults: 5 }, refs)).toBeNull();
  const overflow = { ...exact, adults: 5 };
  const overflowRefs = (await searchPublicStays(home.handle, overflow))
    .options[0]!.recommendedRoomRefs;
  expect(await resolve(home.handle, overflow, overflowRefs)).toBeNull();
  expect(
    await resolve(home.handle, overflow, overflowRefs, true),
  ).toMatchObject({ roomIds: home.roomIds.slice(0, 2) });
  await home.sql`update public.rooms set overflow_arrangement='Different extra bed' where id=${home.roomIds[1]!}`;
  expect(await resolve(home.handle, overflow, overflowRefs, true)).toBeNull();
  await home.sql`insert into public.room_availability_overrides(home_id,room_id,stay,action,created_by_host_id,idempotency_key,request_hash,private_note)
    values(${home.homeId},${home.roomIds[0]!},'[2032-07-07,2032-07-08)','close',${home.hostIds[0]!},${randomUUID()},'fixture','Private reason')`;
  expect(await resolve(home.handle, exact, refs)).toBeNull();
  const changed = await searchPublicStays(home.handle, exact);
  expect(changed.options[0]?.rooms.map((room) => room.guestLabel)).toEqual([
    "Garage Room",
  ]);
  const current = changed.options[0]!.recommendedRoomRefs;
  await home.sql`update public.household_public_listings set published=false where home_id=${home.homeId}`;
  expect(await resolve(home.handle, exact, current)).toBeNull();
  expect(await searchPublicStays(home.handle, exact)).toEqual({
    status: "not_found",
    options: [],
    truncated: false,
  });
});

it("reuses ledger expiry, full-stay openings and same-day turnover for an anonymous guest", async () => {
  const home = await listedHome();
  const { sql, homeId } = home;
  // This household is first searched without a party or invitation. Another
  // party's active room hold then changes the public options.
  const rooms = async () =>
    (await searchPublicStays(home.handle, exact)).options[0]?.rooms.map(
      (room) => room.guestLabel,
    );
  expect(await rooms()).toEqual(["Guest Room", "Garage Room"]);
  const [party] =
    await sql`insert into public.parties (home_id,family_name,locale) values (${homeId},'Other family','en') returning id`;
  const [invitation] =
    await sql`insert into public.invitations(home_id,host_id,party_id,raw_message)
    values (${homeId},${home.hostIds[0]!},${party!.id},'Private request') returning id`;
  const [visit] =
    await sql`insert into public.visits(home_id,invitation_id,party_id,stay,adults,status,hold_expires_at)
    values (${homeId},${invitation!.id},${party!.id},'[2032-07-07,2032-07-08)',2,'hold','2032-07-01T01:00:00Z') returning id`;
  await sql`insert into public.visit_rooms(home_id,visit_id,room_id,stay)
    values (${homeId},${visit!.id},${home.roomIds[0]!},'[2032-07-07,2032-07-08)')`;
  expect(await rooms()).toEqual(["Garage Room"]);
  await sql`update public.visits set hold_expires_at='2032-06-29T01:00:00Z' where id=${visit!.id}`;
  expect(await rooms()).toEqual(["Guest Room", "Garage Room"]);
  const [opening] =
    await sql`insert into public.room_availability_overrides(home_id,room_id,stay,action,created_by_host_id,idempotency_key,request_hash)
    values(${homeId},${home.roomIds[2]!},'[2032-07-01,2032-07-14)','open',${home.hostIds[0]!},${randomUUID()},'fixture') returning id`;
  expect(await rooms()).toEqual(["Guest Room", "Garage Room"]);
  await sql`update public.room_availability_overrides set stay='[2032-07-01,2032-07-15)' where id=${opening!.id}`;
  expect(await rooms()).toEqual(["Guest Room", "Garage Room", "Office Room"]);
  await sql`insert into public.room_availability_overrides(home_id,room_id,stay,action,created_by_host_id,idempotency_key,request_hash)
    values(${homeId},${home.roomIds[0]!},'[2032-07-15,2032-07-16)','close',${home.hostIds[0]!},${randomUUID()},'fixture')`;
  expect(await rooms()).toEqual(["Guest Room", "Garage Room", "Office Room"]);
});

it("rejects a malformed selection without disclosing or accepting private IDs", async () => {
  const home = await listedHome();
  expect(
    await resolvePublicStaySelection(
      home.handle,
      exact,
      "abc" as unknown as string[],
      false,
    ),
  ).toBeNull();
  expect(await searchPublicStays("nonexistent", exact)).toEqual({
    status: "not_found",
    options: [],
    truncated: false,
  });
});
