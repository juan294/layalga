import { randomUUID } from "node:crypto";
import { afterAll, expect, it, onTestFinished } from "vitest";

import { closeDatabase, getDatabaseConnection } from "@/core/db/client";
import {
  createPrivateRoomBlock,
  RoomOperationConflictError,
} from "@/core/rooms/operations";
import { createFixtureHousehold } from "@/test-support/fixture-household";
import { decideRequestedStay } from "./decide-stay-request";
import { setPublicListing } from "./public-listings";
import { searchPublicStays } from "./public-stay-search";
import {
  getRequesterStayRequest,
  submitStayRequest,
  withdrawStayRequest,
} from "./stay-requests";

afterAll(closeDatabase);
const sql = () => getDatabaseConnection().sql;
const stay = ["2090-07-01", "2090-07-15"] as const;
const criteria = {
  from: stay[0],
  to: stay[1],
  nights: 14,
  adults: 3,
  children: 0,
  pets: 0,
};

async function household() {
  const database = sql();
  const home = await createFixtureHousehold(database, {
    label: `Stay decision races ${randomUUID()}`,
    tokenSecret: "test-only",
    hosts: 2,
    parties: [],
  });
  onTestFinished(() => home.cleanup());
  const hosts = home.hostIds.map((id) => ({ id, homeId: home.homeId }));
  await setPublicListing(hosts[0]!, {
    published: true,
    displayName: "Decision race fixture",
  });
  const [listing] = await database<{ handle: string }[]>`
    select handle from public.household_public_listings where home_id=${home.homeId}`;
  const handle = listing!.handle;
  const [option] = (await searchPublicStays(handle, criteria)).options;
  expect(option!.recommendedRoomRefs).toHaveLength(2);
  async function propose() {
    const userId = randomUUID();
    const requester = { userId, email: `${userId}@example.test` };
    await database`insert into auth.users(id,email,aud,role)
      values (${userId},${requester.email},'authenticated','authenticated')`;
    onTestFinished(async () => {
      await database`delete from auth.users where id=${userId}`;
    });
    const result = await submitStayRequest(requester, {
      handle,
      criteria,
      roomRefs: option!.recommendedRoomRefs,
      overflowConsent: false,
      locale: "en",
      notes: "",
      requests: "",
      idempotencyKey: randomUUID(),
    });
    if (result.status !== "pending")
      throw new Error(`Fixture submission was ${result.status}`);
    return { id: result.requestId, userId };
  }
  return {
    homeId: home.homeId,
    roomIds: home.roomIds.slice(0, 2),
    hosts,
    propose,
  };
}

// Query independent persisted effects, including partial rows a returned receipt could mask.
async function effects(homeId: string) {
  const [counts] = await sql()`select
    (select count(*)::int from public.parties where home_id=${homeId}) as parties,
    (select count(*)::int from public.invitations where home_id=${homeId}) as invitations,
    (select count(*)::int from public.visits where home_id=${homeId}) as visits,
    (select count(*)::int from public.visit_rooms where home_id=${homeId} and visit_id is not null) as occupancy,
    (select count(*)::int from public.scheduled_jobs where home_id=${homeId}) as jobs`;
  return counts;
}
const empty = { parties: 0, invitations: 0, visits: 0, occupancy: 0, jobs: 0 };

async function assertBooked(
  homeId: string,
  roomIds: string[],
  visitId: string | null,
) {
  expect(visitId).toBeTruthy();
  expect(await effects(homeId)).toEqual({
    parties: 1,
    invitations: 1,
    visits: 1,
    occupancy: roomIds.length,
    jobs: 1,
  });
  expect(
    await sql()`select status,lower(stay)::text as arrival,upper(stay)::text as departure,
    calendar_eligible_at is not null as calendar from public.visits where home_id=${homeId} and id=${visitId}`,
  ).toEqual([
    {
      status: "confirmed",
      arrival: stay[0],
      departure: stay[1],
      calendar: true,
    },
  ]);
  const rooms = await sql()`select room_id from public.visit_rooms
    where home_id=${homeId} and visit_id=${visitId} and stay=daterange(${stay[0]}::date,${stay[1]}::date,'[)') order by room_id`;
  expect(rooms.map((row) => row.room_id)).toEqual([...roomIds].sort());
  expect(
    await sql()`select kind,status from public.scheduled_jobs where home_id=${homeId} and visit_id=${visitId}`,
  ).toEqual([{ kind: "reconfirm_chase", status: "scheduled" }]);
  expect(
    await sql()`select count(*)::int as linked from public.stay_requests
    where home_id=${homeId} and visit_id=${visitId} and status='confirmed'`,
  ).toEqual([{ linked: 1 }]);
}

it("races opposite answers from two hosts and preserves the actual winner on every retry", async () => {
  const { homeId, hosts, roomIds, propose } = await household();
  const request = await propose();
  const answers = await Promise.all([
    decideRequestedStay(hosts[0]!, request.id, 1, "confirm"),
    decideRequestedStay(hosts[1]!, request.id, 1, "decline"),
  ]);
  const record = await getRequesterStayRequest(request.userId, request.id);
  expect(["confirmed", "declined"]).toContain(record?.status);
  const confirmed = record!.status === "confirmed";
  const winner = confirmed ? 0 : 1;
  expect(answers[winner]).toMatchObject({
    status: record!.status,
    decidedByHostId: hosts[winner]!.id,
    replayed: false,
  });
  expect(answers[1 - winner]).toMatchObject({
    status: "conflict",
    currentStatus: record!.status,
    decidedByHostId: hosts[winner]!.id,
  });
  const retry = await decideRequestedStay(
    hosts[winner]!,
    request.id,
    1,
    confirmed ? "confirm" : "decline",
  );
  expect(retry).toMatchObject({
    status: record!.status,
    visitId: record!.visitId,
    replayed: true,
  });
  if (confirmed) await assertBooked(homeId, roomIds, record!.visitId);
  else expect(await effects(homeId)).toEqual(empty);
});

it("serializes a guest withdrawal against host approval", async () => {
  const { homeId, hosts, roomIds, propose } = await household();
  const r = await propose();
  const [withdrawn, approval] = await Promise.all([
    withdrawStayRequest(r.userId, r.id),
    decideRequestedStay(hosts[0]!, r.id, 1, "confirm"),
  ]);
  const record = await getRequesterStayRequest(r.userId, r.id);
  expect(["withdrawn", "confirmed"]).toContain(record?.status);
  expect(withdrawn?.status).toBe(record!.status);
  expect(approval.status).toBe(record!.status);
  if (record!.status === "confirmed")
    await assertBooked(homeId, roomIds, record!.visitId);
  else expect(await effects(homeId)).toEqual(empty);
});

it("competing requests for the same exact rooms leave one booking and one fresh-search outcome", async () => {
  const { homeId, hosts, roomIds, propose } = await household();
  const a = await propose(),
    b = await propose();
  const results = await Promise.all([
    decideRequestedStay(hosts[0]!, a.id, 1, "confirm"),
    decideRequestedStay(hosts[1]!, b.id, 1, "confirm"),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([
    "confirmed",
    "needs_new_selection",
  ]);
  const receipts = await Promise.all([
    getRequesterStayRequest(a.userId, a.id),
    getRequesterStayRequest(b.userId, b.id),
  ]);
  for (const [index, receipt] of receipts.entries()) {
    expect(receipt).toMatchObject({
      status: results[index]!.status,
      visitId: results[index]!.visitId,
    });
  }
  expect(
    results.find((r) => r.status === "needs_new_selection")!.visitId,
  ).toBeNull();
  await assertBooked(
    homeId,
    roomIds,
    results.find((r) => r.status === "confirmed")!.visitId,
  );
});

it("races a real private block and an exact approval without double occupancy", async () => {
  const { homeId, hosts, roomIds, propose } = await household();
  const r = await propose();
  const [block, approval] = await Promise.allSettled([
    createPrivateRoomBlock(sql(), {
      homeId,
      hostId: hosts[0]!.id,
      roomIds: [roomIds[0]!],
      stay,
      publicLabel: "Host reservation",
      privateNote: "",
      idempotencyKey: randomUUID(),
    }),
    decideRequestedStay(hosts[1]!, r.id, 1, "confirm"),
  ]);
  if (approval.status === "rejected") throw approval.reason;
  const receipt = await getRequesterStayRequest(r.userId, r.id);
  expect(receipt?.status).toBe(approval.value.status);
  const blocks =
    await sql()`select id from public.private_room_blocks where home_id=${homeId}`;
  if (block.status === "fulfilled") {
    expect(blocks).toEqual([{ id: block.value.id }]);
    expect(approval.value.status).toBe("needs_new_selection");
    expect(await effects(homeId)).toEqual(empty);
    expect(
      await sql()`select room_id from public.visit_rooms where home_id=${homeId} and private_block_id=${block.value.id}`,
    ).toEqual([{ room_id: roomIds[0] }]);
  } else {
    expect(block.reason).toBeInstanceOf(RoomOperationConflictError);
    expect(blocks).toHaveLength(0);
    expect(approval.value.status).toBe("confirmed");
    await assertBooked(homeId, roomIds, approval.value.visitId);
  }
});

it("recovers the identical visit from a lost success response without duplicating durable work", async () => {
  const { homeId, hosts, roomIds, propose } = await household();
  const r = await propose();
  // The caller discards the first response, so only the committed guest receipt
  // can establish which visit a fresh request must return.
  await decideRequestedStay(hosts[0]!, r.id, 1, "confirm");
  const committed = await getRequesterStayRequest(r.userId, r.id);
  expect(committed?.status).toBe("confirmed");
  const before =
    await sql()`select id from public.audit_events where home_id=${homeId} order by id`;
  expect(before.length).toBeGreaterThan(0);
  const retry = await decideRequestedStay(hosts[0]!, r.id, 1, "confirm");
  expect(retry).toMatchObject({
    status: "confirmed",
    visitId: committed!.visitId,
    version: committed!.version,
    replayed: true,
  });
  await assertBooked(homeId, roomIds, retry.visitId);
  expect(
    await sql()`select id from public.audit_events where home_id=${homeId} order by id`,
  ).toEqual(before);
});

it.each(["invitations", "visit_rooms"] as const)(
  "rolls back a real failure after inserting %s and allows the original decision to succeed on retry",
  async (table) => {
    const { homeId, hosts, roomIds, propose } = await household();
    const r = await propose();
    const database = sql();
    const [original] =
      await database`select version,status,visit_id from public.stay_requests where id=${r.id}`;
    const audit =
      await database`select id from public.audit_events where home_id=${homeId} order by id`;
    const faultName = "decision_fault_" + randomUUID().replaceAll("-", "");
    const [literal] = await database<
      { value: string }[]
    >`select quote_literal(${homeId}::uuid) as value`;
    // PostgreSQL trigger DDL does not accept a bound parameter in its WHEN
    // clause. Use the database-quoted UUID of this test's own fixture home.
    await database.begin(async (tx) => {
      await tx`create function private.${tx(faultName)}() returns trigger language plpgsql
        as $$ begin raise exception 'phase 3 fixture write fault'; end $$`;
      await tx`create trigger ${tx(faultName)} after insert on public.${tx(table)}
        for each row when (new.home_id=${tx.unsafe(literal!.value)}::uuid)
        execute function private.${tx(faultName)}()`;
    });
    try {
      await expect(
        decideRequestedStay(hosts[0]!, r.id, 1, "confirm"),
      ).rejects.toThrow("phase 3 fixture write fault");
      expect(await effects(homeId)).toEqual(empty);
      expect(
        await database`select version,status,visit_id from public.stay_requests where id=${r.id}`,
      ).toEqual([original]);
      expect(
        await database`select id from public.audit_events where home_id=${homeId} order by id`,
      ).toEqual(audit);
    } finally {
      await database.begin(async (tx) => {
        await tx`drop trigger ${tx(faultName)} on public.${tx(table)}`;
        await tx`drop function private.${tx(faultName)}()`;
      });
    }
    const retry = await decideRequestedStay(hosts[0]!, r.id, 1, "confirm");
    expect(retry).toMatchObject({ status: "confirmed", replayed: false });
    await assertBooked(homeId, roomIds, retry.visitId);
  },
);
