import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { decideRequestedStay } from "../src/core/booking/decide-stay-request";
import {
  discoverPublicListings,
  setPublicListing,
} from "../src/core/booking/public-listings";
import {
  resolvePublicStaySelection,
  searchPublicStays,
} from "../src/core/booking/public-stay-search";
import {
  getRequesterStayRequest,
  submitStayRequest,
} from "../src/core/booking/stay-requests";
import { closeDatabase } from "../src/core/db/client";
import { noopJobScheduler } from "../src/core/reconfirmation/jobs";
import {
  createFixtureHousehold,
  fixtureStay,
  removeFixtureHousehold,
} from "../src/test-support/fixture-household";
import { isLoopbackDatabase, requiredEnvironment } from "./release-helpers";
import type { ProbeContext } from "./release-probes";

function fixtureIdentity(runId: string) {
  return {
    label: "Self-service probe " + runId,
    email: `stay-${runId}@probe.example.invalid`,
  };
}

export function localProbeDatabase() {
  return isLoopbackDatabase(requiredEnvironment("DATABASE_URL"));
}

export async function removeSelfServiceFixture(sql: Sql, runId: string) {
  assert(
    localProbeDatabase(),
    "Self-service fixtures require a loopback database",
  );
  const { label, email } = fixtureIdentity(runId);
  const homes = await sql<
    { id: string }[]
  >`select id from public.homes where name=${label}`;
  for (const home of homes) await removeFixtureHousehold(sql, home.id, label);
  await sql`delete from auth.users where id=${runId} and email=${email}`;
  return homes.length;
}

export async function probeSelfServiceBooking({
  sql,
  runId,
  now,
  tokenSecret,
}: ProbeContext) {
  assert(
    localProbeDatabase(),
    "Self-service fixtures require a loopback database",
  );
  const { label, email } = fixtureIdentity(runId);
  const home = await createFixtureHousehold(sql, {
    label,
    tokenSecret,
    now,
    hosts: 2,
    parties: [],
  });
  try {
    const requester = { userId: runId, email };
    await sql`insert into auth.users (id,email,email_confirmed_at,aud,role) values (${runId},${email},now(),'authenticated','authenticated')`;
    const host = { id: home.hostIds[1]!, homeId: home.homeId };
    await setPublicListing(host, { published: true, displayName: label });
    const listings = await discoverPublicListings(label);
    assert.equal(
      listings.listings.length,
      1,
      "exactly one public household matches the synthetic name",
    );
    const { handle } = listings.listings[0]!;
    const [from, to] = fixtureStay(now, 3, 14);
    const criteria = { from, to, nights: 14, adults: 2, children: 0, pets: 0 };
    const [offer] = (await searchPublicStays(handle, criteria)).options;
    assert.deepEqual(offer?.stay, [from, to]);
    assert(offer);
    const selection = await resolvePublicStaySelection(
      handle,
      criteria,
      offer.recommendedRoomRefs,
      false,
    );
    assert(selection);
    const submission = {
      handle,
      criteria,
      roomRefs: offer.recommendedRoomRefs,
      overflowConsent: false,
      notes: "",
      requests: "Extra blanket",
      locale: "en" as const,
      idempotencyKey: randomUUID(),
    };
    const submitted = await submitStayRequest(requester, submission);
    assert(
      submitted.status === "pending",
      "guest must see awaiting confirmation",
    );
    assert.deepEqual(await submitStayRequest(requester, submission), {
      status: "replayed",
      requestId: submitted.requestId,
    });
    const [before] = await sql`select
      (select count(*)::int from public.invitations where home_id=${home.homeId}) as invitations,
      (select count(*)::int from public.visit_rooms where home_id=${home.homeId}) as occupied,
      (select count(*)::int from public.visits where home_id=${home.homeId}) as visits`;
    assert.deepEqual({ ...before }, { invitations: 0, occupied: 0, visits: 0 });
    const answer = await decideRequestedStay(
      host,
      submitted.requestId,
      1,
      "confirm",
      { scheduler: noopJobScheduler },
    );
    assert.equal(answer.status, "confirmed");
    const receipt = await getRequesterStayRequest(runId, submitted.requestId);
    assert.equal(receipt?.visitId, answer.visitId);
    assert.equal(receipt?.visitStatus, "confirmed");
    assert.deepEqual(receipt.stay, [from, to]);
    const occupied = await sql<
      { room_id: string }[]
    >`select room_id from public.visit_rooms where home_id=${home.homeId} and visit_id=${answer.visitId} and stay=daterange(${from}::date,${to}::date,'[)') order by room_id`;
    assert.deepEqual(
      occupied.map((room) => room.room_id),
      [...selection.roomIds].sort(),
    );
    const [effects] = await sql`select
      (select count(*)::int from public.visits where home_id=${home.homeId}) as visits,
      (select count(*)::int from public.stay_requests where home_id=${home.homeId}) as requests,
      (select count(*)::int from public.audit_events where home_id=${home.homeId} and kind='stay_request_decided') as decisions,
      (select count(*)::int from public.pending_decisions where home_id=${home.homeId}) as exceptions,
      (select count(*)::int from public.visits where home_id=${home.homeId} and id=${answer.visitId} and status='confirmed' and calendar_eligible_at is not null) as confirmed,
      (select count(*)::int from public.visit_rooms where home_id=${home.homeId}) as rooms,
      (select count(*)::int from public.scheduled_jobs where visit_id=${answer.visitId} and kind='reconfirm_chase' and status='scheduled') as jobs`;
    assert.deepEqual(
      { ...effects },
      {
        decisions: 1,
        exceptions: 0,
        confirmed: 1,
        visits: 1,
        requests: 1,
        rooms: offer.recommendedRoomRefs.length,
        jobs: 1,
      },
    );
    return "A first-time guest selected fourteen nights, received one pending receipt and saw the booked visit after one host decision.";
  } finally {
    await closeDatabase();
  }
}
