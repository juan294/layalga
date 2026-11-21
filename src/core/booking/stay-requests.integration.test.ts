import { randomUUID } from "node:crypto";
import { afterAll, expect, it, onTestFinished, vi } from "vitest";
import { closeDatabase, getDatabaseConnection } from "../db/client";
import { createFixtureHousehold } from "../../test-support/fixture-household";
import { setPublicListing } from "./public-listings";
import { searchPublicStays } from "./public-stay-search";
import {
  submitStayRequest,
  findSubmittedStayRequest,
  listRequesterStayRequests,
  getRequesterStayRequest,
  listHostPendingStayRequests,
  withdrawStayRequest,
  type StayRequestInput,
} from "./stay-requests";

afterAll(closeDatabase);
const sql = () => getDatabaseConnection().sql;
async function requester() {
  const userId = randomUUID(),
    email = userId + "@example.test";
  await sql()`insert into auth.users(id,email,aud,role) values (${userId},${email},'authenticated','authenticated')`;
  onTestFinished(async () => {
    await sql()`delete from auth.users where id=${userId}`;
  });
  return { userId, email };
}
async function fixture() {
  const home = await createFixtureHousehold(sql(), {
    label: "Request " + randomUUID(),
    parties: [],
    tokenSecret: "fixture",
  });
  onTestFinished(() => home.cleanup());
  const host = { id: home.hostIds[0]!, homeId: home.homeId };
  await setPublicListing(host, {
    published: true,
    displayName: "Test household",
  });
  const [row] =
    await sql()`select handle from public.household_public_listings where home_id=${home.homeId}`;
  const handle = String(row!.handle);
  const criteria = {
    from: "2090-07-01",
    to: "2090-07-15",
    nights: 14,
    adults: 2,
    children: 0,
    pets: 0,
  };
  const option = (await searchPublicStays(handle, criteria)).options[0]!;
  const input: StayRequestInput = {
    handle,
    criteria,
    roomRefs: option.recommendedRoomRefs,
    overflowConsent: false,
    notes: "Arrival by train",
    requests: "Two pillows",
    locale: "en",
    idempotencyKey: randomUUID(),
  };
  return { home, host, input };
}
it("records exactly one pending proposal without inventory, exposes it only to the requester and the household, and replays even after unpublishing", async () => {
  const { home, host, input } = await fixture();
  const owner = await requester(),
    stranger = await requester();
  expect(await findSubmittedStayRequest(owner.userId, input)).toBeNull();
  const results = await Promise.all([
    submitStayRequest(owner, input),
    submitStayRequest(owner, input),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual(["pending", "replayed"]);
  const record = results.find((r) => r.status === "pending")!;
  const receipt = await getRequesterStayRequest(owner.userId, record.requestId);
  expect(receipt).toMatchObject({
    id: record.requestId,
    notes: input.notes,
    requests: input.requests,
    stay: [input.criteria.from, input.criteria.to],
    rooms: [{ ref: input.roomRefs[0] }],
    status: "pending",
    version: 1,
  });
  expect(await listRequesterStayRequests(stranger.userId)).toEqual([]);
  expect(
    await getRequesterStayRequest(stranger.userId, record.requestId),
  ).toBeNull();
  expect(
    await withdrawStayRequest(stranger.userId, record.requestId),
  ).toBeNull();
  expect(
    await listHostPendingStayRequests({
      id: randomUUID(),
      homeId: home.homeId,
    }),
  ).toEqual([]);
  expect(await listHostPendingStayRequests(host)).toMatchObject([
    { id: record.requestId, requesterEmail: owner.email },
  ]);
  const [counts] =
    await sql()`select (select count(*)::int from public.visits where home_id=${home.homeId}) as visits,
    (select count(*)::int from public.visit_rooms where home_id=${home.homeId}) as occupancy,
    (select count(*)::int from public.parties where home_id=${home.homeId}) as parties,
    (select count(*)::int from public.invitations where home_id=${home.homeId}) as invitations`;
  expect(counts).toEqual({
    visits: 0,
    occupancy: 0,
    parties: 0,
    invitations: 0,
  });
  await setPublicListing(host, { published: false });
  const upper = {
    ...input,
    handle: input.handle.toUpperCase(),
    idempotencyKey: input.idempotencyKey.toUpperCase(),
  };
  expect(await findSubmittedStayRequest(stranger.userId, upper)).toBeNull();
  expect(
    await findSubmittedStayRequest(owner.userId.toUpperCase(), upper),
  ).toEqual({ status: "replayed", requestId: record.requestId });
  expect(
    await submitStayRequest(
      { ...owner, userId: owner.userId.toUpperCase() },
      upper,
    ),
  ).toEqual({ status: "replayed", requestId: record.requestId });

  expect(await submitStayRequest(owner, input)).toEqual({
    status: "replayed",
    requestId: record.requestId,
  });
  expect(
    await submitStayRequest(owner, { ...input, notes: "new terms" }),
  ).toEqual({ status: "conflict", requestId: record.requestId });
  expect(
    await submitStayRequest(owner, { ...input, idempotencyKey: randomUUID() }),
  ).toEqual({ status: "stale" });
  expect(
    await withdrawStayRequest(owner.userId, record.requestId),
  ).toMatchObject({ status: "withdrawn", version: 2 });
  expect(
    await withdrawStayRequest(owner.userId, record.requestId),
  ).toMatchObject({ status: "withdrawn", version: 2 });
  expect(await listHostPendingStayRequests(host)).toEqual([]);
});
it("enforces the pending cap across concurrent distinct keys and releases one place after withdrawal", async () => {
  const { input } = await fixture();
  const owner = await requester();
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      submitStayRequest(owner, { ...input, idempotencyKey: randomUUID() }),
    ),
  );
  expect(results.filter((r) => r.status === "pending")).toHaveLength(3);
  expect(results.filter((r) => r.status === "limit")).toHaveLength(2);
  const receipt = (await listRequesterStayRequests(owner.userId))[0]!;
  await withdrawStayRequest(owner.userId, receipt.id);
  expect((await submitStayRequest(owner, input)).status).toBe("pending");
});

it("uses the same cap for alternate UUID spellings and allows idempotent recovery at the cap", async () => {
  vi.stubEnv("STAY_REQUEST_PENDING_LIMIT", "1");
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  const { input } = await fixture();
  const owner = await requester();
  const attempts = await Promise.all([
    submitStayRequest(owner, input),
    submitStayRequest(
      { ...owner, userId: owner.userId.toUpperCase() },
      {
        ...input,
        handle: input.handle.toUpperCase(),
        idempotencyKey: randomUUID(),
      },
    ),
  ]);
  expect(attempts.filter((r) => r.status === "pending")).toHaveLength(1);
  expect(attempts.filter((r) => r.status === "limit")).toHaveLength(1);
});

it("refuses changed room terms or overflow without consent, then allows a fresh guest review", async () => {
  const { input, home } = await fixture();
  const owner = await requester();
  input.criteria.adults = 5;
  const option = (await searchPublicStays(input.handle, input.criteria))
    .options[0]!;
  input.roomRefs = option.recommendedRoomRefs;
  expect(await submitStayRequest(owner, input)).toEqual({ status: "stale" });
  await sql()`update public.rooms set overflow_arrangement='A changed bed arrangement' where id=${home.roomIds[1]!}`;
  input.overflowConsent = true;
  expect(await submitStayRequest(owner, input)).toEqual({ status: "stale" });
  expect(await listRequesterStayRequests(owner.userId)).toEqual([]);
  input.roomRefs = (
    await searchPublicStays(input.handle, input.criteria)
  ).options[0]!.recommendedRoomRefs;
  const submitted = await submitStayRequest(owner, input);
  expect(submitted.status).toBe("pending");
  const [receipt] = await listRequesterStayRequests(owner.userId);
  expect(receipt?.rooms.map((room) => room.overflowArrangement)).toContain(
    "A changed bed arrangement",
  );
  expect(receipt?.overflowConsent).toBe(true);
  expect(receipt).not.toHaveProperty("requesterEmail");
});

it("expires overdue pending receipts before a late withdrawal and removes old terminal details in maintenance", async () => {
  const { input, host } = await fixture();
  const owner = await requester();
  const result = await submitStayRequest(owner, input);
  if (result.status !== "pending")
    throw new Error("Expected a pending receipt");
  // Move only this disposable fixture's stay into the past. No job runs first.
  await sql()`update public.stay_requests set stay='[2000-01-01,2000-01-15)' where id=${result.requestId}`;
  expect(
    await withdrawStayRequest(owner.userId, result.requestId),
  ).toMatchObject({ status: "expired", version: 2 });
  expect(await listHostPendingStayRequests(host)).toHaveLength(0);
  expect(
    await getRequesterStayRequest(owner.userId, result.requestId),
  ).toMatchObject({ status: "expired", version: 2 });
  // The maintenance function covers the whole database. Roll back its
  // effects after inspecting this specific fixture.
  await expect(
    sql().begin(async (tx) => {
      await tx`select private.apply_data_retention(now())`;
      expect(
        await tx`select id from public.stay_requests where id=${result.requestId}`,
      ).toHaveLength(0);
      throw new Error("rollback fixture retention");
    }),
  ).rejects.toThrow("rollback fixture retention");
});

it("enforces table/column privileges and row policies separately, and verifies the web role can validate selected terms", async () => {
  const { input, home } = await fixture();
  const owner = await requester();
  const submitted = await submitStayRequest(owner, input);
  if (submitted.status !== "pending")
    throw new Error("Expected a pending receipt");
  for (const role of [
    "anon",
    "authenticated",
    "service_role",
    "layalga_agent_runtime",
  ]) {
    const [access] = await sql()`select
      has_table_privilege(${role},'public.stay_requests','select') as read,
      has_table_privilege(${role},'public.stay_requests','insert') as write`;
    expect(access).toEqual({ read: false, write: false });
  }
  await sql().begin(async (tx) => {
    await tx`savepoint request_privileges`;
    await tx`grant layalga_web_runtime to current_user`;
    await tx`set local role layalga_web_runtime`;
    const [row] =
      await tx`select id from public.stay_requests where id=${submitted.requestId}`;
    expect(row!.id).toBe(submitted.requestId);
    const [privilege] =
      await tx`select has_column_privilege(current_user,'public.stay_requests','notes','update') as alter_terms`;
    expect(privilege!.alter_terms).toBe(false);
    const { resolvePublicStaySelection } = await import("./public-stay-search");
    expect(
      await resolvePublicStaySelection(
        input.handle,
        input.criteria,
        input.roomRefs,
        false,
        tx,
      ),
    ).toMatchObject({ homeId: home.homeId });
    const [copy] = await tx`insert into public.stay_requests
      (home_id,listing_handle,display_name,requester_id,requester_email,idempotency_key,payload_hash,stay,
       adults,children,pets,room_ids,room_terms,overflow_consent,notes,requests,locale)
      select home_id,listing_handle,display_name,requester_id,requester_email,${randomUUID()},payload_hash,stay,
       adults,children,pets,room_ids,room_terms,overflow_consent,notes,requests,locale from public.stay_requests
       where id=${submitted.requestId} returning id`;
    expect(
      await tx`update public.stay_requests set status='withdrawn',terminal_at=now(),
      updated_at=now(),version=version+1 where id=${copy!.id} returning version`,
    ).toEqual([{ version: 2 }]);
    await tx`rollback to savepoint request_privileges`;
  });
  // Give authenticated SELECT only inside a rolled-back transaction to prove
  // RLS independently, including the logged-in owner and another auth subject.
  await expect(
    sql().begin(async (tx) => {
      await tx`grant select on public.stay_requests to authenticated`;
      await tx`set local role authenticated`;
      for (const sub of [owner.userId, randomUUID()]) {
        await tx`select set_config('request.jwt.claim.sub',${sub},true)`;
        expect(
          await tx`select id from public.stay_requests where id=${submitted.requestId}`,
        ).toHaveLength(0);
      }
      throw new Error("rollback fixture privileges");
    }),
  ).rejects.toThrow("rollback fixture privileges");
});

it("prevents mixed-household links or rooms even when a database writer supplies them", async () => {
  const a = await fixture(),
    b = await fixture(),
    owner = await requester();
  const submitted = await submitStayRequest(owner, a.input);
  if (submitted.status !== "pending")
    throw new Error("Expected a pending receipt");
  await expect(
    sql()`update public.stay_requests set room_ids=${sql().array([b.home.roomIds[0]!])}::uuid[] where id=${submitted.requestId}`,
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sql()`update public.stay_requests set listing_handle=${b.input.handle} where id=${submitted.requestId}`,
  ).rejects.toMatchObject({ code: "23503" });
});

it("keeps fresh terminal receipts and removes duplicate personal details from confirmed requests while preserving visit access", async () => {
  const { input, home, host } = await fixture();
  const owner = await requester();
  const accepted = await submitStayRequest(owner, input);
  const withdrawn = await submitStayRequest(owner, {
    ...input,
    idempotencyKey: randomUUID(),
  });
  if (accepted.status !== "pending" || withdrawn.status !== "pending")
    throw new Error("Expected both receipts");
  await withdrawStayRequest(owner.userId, withdrawn.requestId);
  await expect(
    sql().begin(async (tx) => {
      const [party] =
        await tx`insert into public.parties(home_id,family_name,locale) values(${home.homeId},'New guest','en') returning id`;
      const [invite] =
        await tx`insert into public.invitations(home_id,party_id,host_id,raw_message) values(${home.homeId},${party!.id},${host.id},'Fixture') returning id`;
      const [visit] =
        await tx`insert into public.visits(home_id,party_id,invitation_id,stay,adults,status) values
      (${home.homeId},${party!.id},${invite!.id},'[2090-07-01,2090-07-15)',2,'confirmed') returning id`;
      await tx`update public.stay_requests set visit_id=${visit!.id},status='confirmed',terminal_at=now() where id=${accepted.requestId}`;
      await tx`select private.apply_data_retention(now())`;
      expect(
        await tx`select requester_id,visit_id,requester_email,notes,requests,stay,room_terms from public.stay_requests where id=${accepted.requestId}`,
      ).toEqual([
        {
          requester_id: owner.userId,
          visit_id: visit!.id,
          requester_email: null,
          notes: "",
          requests: "",
          stay: null,
          room_terms: [],
        },
      ]);
      expect(
        await tx`select id from public.stay_requests where id=${withdrawn.requestId}`,
      ).toHaveLength(1);
      await tx`delete from public.visits where id=${visit!.id}`;
      expect(
        await tx`select id from public.stay_requests where id=${accepted.requestId}`,
      ).toHaveLength(0);
      throw new Error("rollback fixture confirmation");
    }),
  ).rejects.toThrow("rollback fixture confirmation");
});

it("recovers a new submission racing withdrawal at the configured household limit", async () => {
  vi.stubEnv("STAY_REQUEST_PENDING_LIMIT", "1");
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  const { input } = await fixture();
  const owner = await requester();
  const first = await submitStayRequest(owner, input);
  if (first.status !== "pending") throw new Error("Expected a pending request");
  const next = { ...input, idempotencyKey: randomUUID() };
  const [withdrawn, submitted] = await Promise.all([
    withdrawStayRequest(owner.userId, first.requestId),
    submitStayRequest(owner, next),
  ]);
  expect(withdrawn?.status).toBe("withdrawn");
  const retried = await submitStayRequest(owner, next);
  if (submitted.status === "limit") {
    expect(retried.status).toBe("pending");
  } else {
    expect(submitted.status).toBe("pending");
    if (submitted.status !== "pending")
      throw new Error("Unexpected concurrent result");
    expect(retried).toEqual({
      status: "replayed",
      requestId: submitted.requestId,
    });
  }
  expect(
    (await listRequesterStayRequests(owner.userId)).map(
      (request) => request.status,
    ),
  ).toEqual(["pending", "withdrawn"]);
});
