import { randomUUID } from "node:crypto";
import { afterAll, expect, it, onTestFinished, vi } from "vitest";
import { getDatabaseConnection, closeDatabase } from "@/core/db/client";
import { createFixtureHousehold } from "@/test-support/fixture-household";
import { guestTurn } from "./guest-conversation";
import {
  resolvePublicStaySelection,
  searchPublicStays,
} from "./public-stay-search";
afterAll(closeDatabase);
it("matches structured dates and refs, then finds the preferred sleeping arrangement beyond the unfiltered cap", async () => {
  vi.stubEnv("MODEL", "scripted");
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  const { sql } = getDatabaseConnection();
  const label = "Casa " + randomUUID().slice(0, 8);
  const home = await createFixtureHousehold(sql, {
    label,
    parties: [],
    tokenSecret: "fixture",
  });
  onTestFinished(() => home.cleanup());
  const [listing] = await sql<
    { handle: string }[]
  >`insert into public.household_public_listings(home_id,display_name,search_name,published)
  values(${home.homeId},${label},${label.toLowerCase()},true) returning handle`;
  await sql`insert into public.room_availability_overrides(home_id,room_id,stay,action,created_by_host_id,idempotency_key,request_hash,private_note)
 values(${home.homeId},${home.roomIds[1]!},'[2090-07-01,2090-07-14)','close',${home.hostIds[0]!},${randomUUID()},'fixture','Hidden plans')`;
  const response = await guestTurn({
    locale: "es",
    message: `Dos semanas en julio 2090 en ${label} para dos adultos`,
  });
  expect(response.kind).toBe("options");
  expect(response.options).toHaveLength(12);
  const direct = await searchPublicStays(listing!.handle, response.criteria!);
  expect(response.options).toEqual(direct.options);
  const refined = await guestTurn({
    locale: "es",
    message: "Prefiero un sofá cama",
    state: response.state,
  });
  expect(refined.kind).toBe("options");
  expect(refined.options![0]!.stay).toEqual(["2090-07-14", "2090-07-28"]);
  const selected = refined.options![0]!;
  expect(selected.rooms.map((r) => r.guestLabel)).toEqual(["Garage Room"]);
  const exact = {
    ...refined.criteria!,
    from: selected.stay[0],
    to: selected.stay[1],
  };
  expect(
    await resolvePublicStaySelection(
      listing!.handle,
      exact,
      selected.recommendedRoomRefs,
      false,
    ),
  ).toMatchObject({ roomIds: [home.roomIds[1]] });
  expect(JSON.stringify(refined)).not.toContain("Hidden plans");
  expect(JSON.stringify(refined)).not.toContain(home.homeId);
  expect(
    await guestTurn({
      locale: "en",
      message: "I prefer a hammock",
      state: response.state,
    }),
  ).toMatchObject({ kind: "none" });
  const [counts] =
    await sql`select (select count(*)::int from public.stay_requests where home_id=${home.homeId}) requests,
  (select count(*)::int from public.visits where home_id=${home.homeId}) visits`;
  expect(counts).toEqual({ requests: 0, visits: 0 });
});
