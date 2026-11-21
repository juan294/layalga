import { randomUUID } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
import { getDatabaseConnection, closeDatabase } from "../db/client";
import { createFixtureHousehold } from "@/test-support/fixture-household";
import { setPublicListing } from "./public-listings";
import { searchPublicStays } from "./public-stay-search";
import { getRequesterStayRequest, submitStayRequest } from "./stay-requests";
import { decideRequestedStay } from "./decide-stay-request";
import { loadRequestedVisit } from "./requested-visit";
import { withdrawInvitation } from "./cancellation";
import { getAuthorizedRunSnapshot } from "@/app/api/runs/run-data";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/verified-requester", () => ({
  verifiedRequester: async () => (auth.userId ? { userId: auth.userId } : null),
}));
vi.mock("@/lib/auth/current-host", () => ({
  getCurrentHost: async () => null,
}));
vi.mock("@/lib/auth/current-guest", () => ({
  getCurrentGuestInvitation: async () => null,
}));
afterAll(closeDatabase);

it("binds changes and run status to the approved guest and keeps the private visit current after cancellation", async () => {
  const { sql, db } = getDatabaseConnection();
  const guest = { userId: randomUUID(), email: randomUUID() + "@example.test" };
  const home = await createFixtureHousehold(sql, {
    label: "Private visit " + randomUUID(),
    tokenSecret: "fixture",
    parties: [],
  });
  try {
    await sql`insert into auth.users(id,email,aud,role) values (${guest.userId},${guest.email},'authenticated','authenticated')`;
    const host = { id: home.hostIds[0]!, homeId: home.homeId };
    await setPublicListing(host, {
      published: true,
      displayName: "Private Visit",
    });
    const [listing] = await sql<
      { handle: string }[]
    >`select handle from public.household_public_listings where home_id=${home.homeId}`;
    const handle = listing!.handle;
    const criteria = {
      from: "2090-07-01",
      to: "2090-07-15",
      nights: 14,
      adults: 2,
      children: 0,
      pets: 0,
    };
    const [option] = (await searchPublicStays(handle, criteria)).options;
    const sent = await submitStayRequest(guest, {
      handle,
      criteria,
      roomRefs: option!.recommendedRoomRefs,
      overflowConsent: false,
      notes: "By train",
      requests: "",
      locale: "es",
      idempotencyKey: randomUUID(),
    });
    if (sent.status !== "pending") throw new Error(sent.status);
    expect(
      await loadRequestedVisit(guest.userId, sent.requestId, "es"),
    ).toBeNull();
    const approved = await decideRequestedStay(
      host,
      sent.requestId,
      1,
      "confirm",
    );
    expect(approved.status).toBe("confirmed");
    const found = await loadRequestedVisit(guest.userId, sent.requestId, "es");
    expect(found?.visit).toMatchObject({
      id: approved.visitId,
      status: "confirmed",
      stay: [criteria.from, criteria.to],
      roomCount: 1,
    });
    const stranger = randomUUID();
    expect(await loadRequestedVisit(stranger, sent.requestId, "es")).toBeNull();
    const [run] = await sql<
      { id: string }[]
    >`insert into public.runs(home_id,session_id,task,status,payload) values
      (${home.homeId},${"inv_" + found!.id},'guest_change','queued',${JSON.stringify({ visitId: approved.visitId })}::text::jsonb) returning id`;
    auth.userId = stranger;
    expect(await getAuthorizedRunSnapshot(run!.id)).toBeNull();
    auth.userId = guest.userId;
    expect(await getAuthorizedRunSnapshot(run!.id)).toMatchObject({
      status: "queued",
    });
    await withdrawInvitation(db, {
      homeId: home.homeId,
      invitationId: found!.id,
      actor: { kind: "guest", partyId: found!.partyId },
      expectedStay: [criteria.from, criteria.to],
      expectedVisitId: approved.visitId,
    });
    expect(
      (await getRequesterStayRequest(guest.userId, sent.requestId))
        ?.visitStatus,
    ).toBe("cancelled");
    expect(
      (await loadRequestedVisit(guest.userId, sent.requestId, "en"))?.visit
        ?.status,
    ).toBe("cancelled");
  } finally {
    auth.userId = "";
    await home.cleanup();
    await sql`delete from auth.users where id=${guest.userId}`;
  }
});
