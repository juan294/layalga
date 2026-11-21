import { randomUUID } from "node:crypto";
import { afterAll, expect, it, onTestFinished, vi } from "vitest";
import { createFixtureHousehold } from "@/test-support/fixture-household";
import { FakeClock } from "../clock";
import { closeDatabase, getDatabaseConnection } from "../db/client";
import { decideRequestedStay } from "./decide-stay-request";
import { setPublicListing } from "./public-listings";
import { searchPublicStays } from "./public-stay-search";
import {
  submitStayRequest,
  getRequesterStayRequest,
  withdrawStayRequest,
} from "./stay-requests";

afterAll(closeDatabase);
const sql = () => getDatabaseConnection().sql;
async function scenario(adults = 2) {
  const home = await createFixtureHousehold(sql(), {
    label: "Decision " + randomUUID(),
    hosts: 2,
    parties: [],
    tokenSecret: "fixture",
  });
  onTestFinished(() => home.cleanup());
  const host = { id: home.hostIds[0]!, homeId: home.homeId };
  const otherHost = { ...host, id: home.hostIds[1]! };
  const userId = randomUUID();
  const email = userId + "@example.test";
  await sql()`insert into auth.users(id,email,aud,role) values (${userId},${email},'authenticated','authenticated')`;
  onTestFinished(async () => {
    await sql()`delete from auth.users where id=${userId}`;
  });
  await setPublicListing(host, {
    published: true,
    displayName: "Decision fixture",
  });
  const [listing] =
    await sql()`select handle from public.household_public_listings where home_id=${host.homeId}`;
  const handle = String(listing!.handle);
  const criteria = {
    from: "2091-07-01",
    to: "2091-07-15",
    nights: 14,
    adults,
    children: 0,
    pets: 1,
  };
  const option = (await searchPublicStays(handle, criteria)).options[0]!;
  async function submit(roomIndex: number) {
    const result = await submitStayRequest(
      { userId, email },
      {
        handle,
        criteria,
        roomRefs: [option.rooms[roomIndex]!.ref],
        overflowConsent: adults > 2,
        notes: "Arrival by train",
        requests: "Two pillows",
        locale: "en",
        idempotencyKey: randomUUID(),
      },
    );
    if (result.status !== "pending") throw new Error(result.status);
    return result.requestId;
  }
  const roomIndex = adults > 2 ? 1 : 0;
  return { home, host, otherHost, userId, id: await submit(roomIndex), submit };
}

it("commits the exact rooms, calendar, verified account and one chase before attempting external scheduling", async () => {
  const { home, host, otherHost, userId, id } = await scenario();
  const [unrelated] =
    await sql()`insert into public.parties(home_id,family_name,locale)
    values (${home.homeId},'Guest','en') returning id`;
  let statusAtSchedule: string | undefined;
  const scheduler = {
    cancel: vi.fn(),
    schedule: vi.fn(async () => {
      const [row] =
        await sql()`select status from public.stay_requests where id=${id}`;
      statusAtSchedule = row?.status;
      throw new Error("scheduler offline");
    }),
  };
  const booked = await decideRequestedStay(host, id, 1, "confirm", {
    scheduler,
  });
  expect(statusAtSchedule).toBe("confirmed");
  const [untouched] =
    await sql()`select auth_user_id from public.parties where id=${unrelated!.id}`;
  expect(untouched!.auth_user_id).toBeNull();
  expect(booked).toMatchObject({
    status: "confirmed",
    replayed: false,
    version: 2,
    decidedByName: "Host 1",
  });
  expect(await getRequesterStayRequest(userId, id)).toMatchObject({
    status: "confirmed",
    visitId: booked.visitId,
  });
  const [row] =
    await sql()`select v.status, lower(v.stay)::text as arrival,upper(v.stay)::text as departure,v.special_requests,v.guest_notes,
    v.calendar_eligible_at is not null as eligible,p.auth_user_id,vr.room_id,
    (select count(*)::int from public.scheduled_jobs where visit_id=v.id and status='scheduled') jobs,
    (select count(*)::int from public.audit_events where home_id=v.home_id and payload->>'requestId'=${id}) audits
    from public.visits v join public.parties p on p.id=v.party_id join public.visit_rooms vr on vr.visit_id=v.id where v.id=${booked.visitId}`;
  expect(row).toEqual({
    status: "confirmed",
    arrival: "2091-07-01",
    departure: "2091-07-15",
    special_requests: ["Two pillows"],
    guest_notes: "Arrival by train",
    eligible: true,
    auth_user_id: userId,
    room_id: home.roomIds[0],
    jobs: 1,
    audits: 1,
  });
  expect(await decideRequestedStay(host, id, 42, "confirm")).toMatchObject({
    status: "stale",
    currentStatus: "confirmed",
    replayed: false,
  });
  expect(scheduler.schedule).toHaveBeenCalledTimes(1);
  expect(
    await decideRequestedStay(host, id, 1, "confirm", { scheduler }),
  ).toEqual({ ...booked, replayed: true });
  expect(await decideRequestedStay(otherHost, id, 1, "decline")).toMatchObject({
    status: "conflict",
    currentStatus: "confirmed",
    decidedByName: "Host 1",
  });
  expect(scheduler.schedule).toHaveBeenCalledTimes(1);
});

it("approves the explicitly accepted overflow and special request together, reusing only an unambiguous verified party", async () => {
  const { home, host, id, userId } = await scenario(4);
  const [party] =
    await sql()`insert into public.parties(home_id,family_name,locale,auth_user_id) values (${home.homeId},'Existing party','es',${userId}) returning id`;
  const result = await decideRequestedStay(host, id, 1, "confirm");
  expect(result.status).toBe("confirmed");
  const [row] =
    await sql()`select v.party_id,v.approval_stay_hash,v.special_requests,vr.room_id from public.visits v join public.visit_rooms vr on vr.visit_id=v.id where v.id=${result.visitId}`;
  expect(row).toMatchObject({
    party_id: party!.id,
    room_id: home.roomIds[1],
    special_requests: ["Two pillows"],
    approval_stay_hash: expect.any(String),
  });
});

it("creates a fresh verified party when more than one same-home party is already bound", async () => {
  const { home, host, id, userId } = await scenario();
  const prior =
    await sql()`insert into public.parties(home_id,family_name,locale,auth_user_id) values
  (${home.homeId},'Shared','en',${userId}),(${home.homeId},'Shared','en',${userId}) returning id`;
  const booked = await decideRequestedStay(host, id, 1, "confirm");
  const [party] =
    await sql()`select p.id,p.auth_user_id from public.parties p join public.visits v on v.party_id=p.id where v.id=${booked.visitId}`;
  expect(party!.auth_user_id).toBe(userId);
  expect(prior.map((p) => p.id)).not.toContain(party!.id);
});

it.each(["wording", "capacity", "consent"] as const)(
  "requires a fresh selection after a change to %s",
  async (change) => {
    const { home, host, id } = await scenario(4);
    if (change === "wording")
      await sql()`update public.rooms set overflow_arrangement='Another mattress' where id=${home.roomIds[1]!}`;
    if (change === "capacity")
      await sql()`update public.rooms set maximum_capacity=3 where id=${home.roomIds[1]!}`;
    if (change === "consent")
      await sql()`update public.stay_requests set overflow_consent=false where id=${id}`;
    expect(await decideRequestedStay(host, id, 1, "confirm")).toMatchObject({
      status: "needs_new_selection",
      version: 2,
      visitId: null,
    });
    const [row] =
      await sql()`select count(*)::int n from public.invitations where home_id=${host.homeId}`;
    expect(row!.n).toBe(0);
  },
);

it("rejects newly overlapping pets even on distinct rooms", async () => {
  const { host, id, submit } = await scenario();
  const second = await submit(1);
  expect((await decideRequestedStay(host, id, 1, "confirm")).status).toBe(
    "confirmed",
  );
  expect((await decideRequestedStay(host, second, 1, "confirm")).status).toBe(
    "needs_new_selection",
  );
});

it("denies foreign disclosure and stale review, then allows a decline after the room changed", async () => {
  const { home, host, id, otherHost } = await scenario();
  expect(
    await decideRequestedStay(
      { id: randomUUID(), homeId: home.homeId },
      id,
      1,
      "confirm",
    ),
  ).toMatchObject({
    status: "not_found",
    currentStatus: null,
    visitId: null,
    decidedByName: null,
  });
  expect(await decideRequestedStay(host, id, 2, "confirm")).toMatchObject({
    status: "stale",
    version: 1,
  });
  await sql()`update public.rooms set inventory_state='withheld' where id=${home.roomIds[0]!}`;
  expect(await decideRequestedStay(otherHost, id, 1, "decline")).toMatchObject({
    status: "declined",
    decidedByHostId: otherHost.id,
    visitId: null,
  });
  expect(await decideRequestedStay(otherHost, id, 1, "decline")).toMatchObject({
    status: "declined",
    replayed: true,
  });
  expect(await decideRequestedStay(host, id, 1, "confirm")).toMatchObject({
    status: "conflict",
    currentStatus: "declined",
    decidedByName: "Host 2",
  });
});

it("returns withdrawal and household-local expiry without allocating a visit", async () => {
  const { host, id, userId, submit } = await scenario();
  await withdrawStayRequest(userId, id);
  expect((await decideRequestedStay(host, id, 1, "confirm")).status).toBe(
    "withdrawn",
  );
  const older = await submit(0);
  const clock = new FakeClock(new Date("2091-07-01T22:01:00Z"));
  expect(
    (await decideRequestedStay(host, older, 1, "confirm", { clock })).status,
  ).toBe("expired");
});
