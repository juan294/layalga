import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { hashLinkToken } from "@/core/booking/invitations";

import {
  createFixtureHousehold,
  fixtureStay,
  type FixtureHousehold,
} from "./fixture-household";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const tokenSecret =
  process.env.LINK_TOKEN_SECRET ?? "0123456789abcdef0123456789abcdef";
const db = postgres(connectionUrl, { max: 4, prepare: false });

async function residue(homeId: string, sessionIds: readonly string[]) {
  const [counts] = await db<
    { homes: number; hosts: number; parties: number; sessions: number }[]
  >`
    select
      (select count(*)::int from public.homes where id = ${homeId}) as homes,
      (select count(*)::int from public.hosts where home_id = ${homeId}) as hosts,
      (select count(*)::int from public.parties where home_id = ${homeId}) as parties,
      (
        select count(*)::int from public.agent_sessions
        where session_id = any(${db.array([...sessionIds])}::text[])
      ) as sessions
  `;
  return counts;
}

describe("fixture household", () => {
  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("builds a non-demo household with hashed guest tokens and cleans up to zero rows", async () => {
    const label = `Fixture ${randomUUID()}`;
    const household = await createFixtureHousehold(db, {
      label,
      tokenSecret,
    });
    let cleaned = false;
    try {
      const [home] = await db<{ name: string; demo: boolean }[]>`
        select name, demo from public.homes where id = ${household.homeId}
      `;
      expect(home).toEqual({ name: label, demo: false });
      expect(household.roomIds).toHaveLength(3);
      expect(household.hostIds).toHaveLength(1);
      expect(household.parties.map((party) => party.familyName)).toEqual([
        "Familia Vega",
        "The Parkers",
      ]);

      const vega = household.parties[0]!;
      expect(vega.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const [invitation] = await db<
        {
          link_token: string;
          raw_message: string;
          structured: { preferredStay: [string, string] };
        }[]
      >`
        select link_token, raw_message, structured
        from public.invitations where id = ${vega.invitationId}
      `;
      expect(invitation?.link_token).toBe(
        hashLinkToken(vega.token, tokenSecret),
      );
      expect(invitation?.raw_message.endsWith(`[${label}]`)).toBe(true);
      expect(invitation?.structured.preferredStay).toEqual(vega.preferredStay);
      expect(new Date(`${vega.preferredStay[0]}T00:00:00Z`).getTime()).toBeGreaterThan(
        Date.now(),
      );

      // A host-bound auth user and a durable session are removed by cleanup.
      const [user] = await db<{ id: string }[]>`
        insert into auth.users (id, email, aud, role)
        values (${randomUUID()}, ${`${randomUUID()}@fixture.test`}, 'authenticated', 'authenticated')
        returning id
      `;
      await db`
        update public.hosts set auth_user_id = ${user!.id}
        where id = ${household.hostIds[0]!}
      `;
      const sessionIds = [
        `inv_${vega.invitationId}`,
        `capture_${household.hostIds[0]}`,
      ];
      for (const sessionId of sessionIds) {
        await db`
          insert into public.agent_sessions (key, session_id, data)
          values (${`${sessionId}/snapshot`}, ${sessionId}, ${Buffer.from("{}")})
        `;
      }

      await household.cleanup();
      cleaned = true;
      expect(await residue(household.homeId, sessionIds)).toEqual({
        homes: 0,
        hosts: 0,
        parties: 0,
        sessions: 0,
      });
      const [authUsers] = await db<{ count: number }[]>`
        select count(*)::int as count from auth.users where id = ${user!.id}
      `;
      expect(authUsers?.count).toBe(0);
    } finally {
      if (!cleaned) await household.cleanup();
    }
  });

  it("supports an empty household with no rooms or parties", async () => {
    const household = await createFixtureHousehold(db, {
      label: `Empty ${randomUUID()}`,
      tokenSecret,
      rooms: [],
      parties: [],
    });
    try {
      expect(household.roomIds).toEqual([]);
      expect(household.parties).toEqual([]);
      const [rooms] = await db<{ count: number }[]>`
        select count(*)::int as count from public.rooms where home_id = ${household.homeId}
      `;
      expect(rooms?.count).toBe(0);
    } finally {
      await household.cleanup();
    }
  });

  it("lets two concurrent builders create independent households", async () => {
    const households: FixtureHousehold[] = await Promise.all([
      createFixtureHousehold(db, { label: `Concurrent A ${randomUUID()}`, tokenSecret }),
      createFixtureHousehold(db, { label: `Concurrent B ${randomUUID()}`, tokenSecret }),
    ]);
    try {
      const [first, second] = households;
      expect(first!.homeId).not.toBe(second!.homeId);
      expect(first!.parties[0]!.token).not.toBe(second!.parties[0]!.token);
    } finally {
      await Promise.all(households.map((household) => household.cleanup()));
    }
    for (const household of households) {
      expect((await residue(household.homeId, []))?.homes).toBe(0);
    }
  });

  it("rolls back a failed build and names the label", async () => {
    const label = `Broken ${randomUUID()}`;
    await expect(
      createFixtureHousehold(db, {
        label,
        tokenSecret,
        parties: [
          {
            familyName: "Duplicate",
            locale: "en",
            rawMessage: "first",
            adults: 1,
            children: 0,
            pets: 0,
            specialRequests: [],
          },
          {
            familyName: "Duplicate",
            locale: "en",
            rawMessage: "second",
            adults: 1,
            children: 0,
            pets: 0,
            specialRequests: [],
          },
        ],
      }),
    ).rejects.toThrow(label);
    const [homes] = await db<{ count: number }[]>`
      select count(*)::int as count from public.homes where name = ${label}
    `;
    expect(homes?.count).toBe(0);
  });

  it("chooses a future weekend stay", () => {
    const now = new Date("2026-10-15T10:00:00Z"); // a Thursday
    expect(fixtureStay(now, 0, 3)).toEqual(["2026-11-06", "2026-11-09"]);
    expect(fixtureStay(now, 1, 2)).toEqual(["2026-11-07", "2026-11-09"]);
  });
});
