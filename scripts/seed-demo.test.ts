import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { hashLinkToken } from "@/core/booking/invitations";
import { claimHostIdentity } from "@/lib/auth/host-identity";

import { DEMO_SEED, seedDemo } from "./seed-demo";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false });

describe("seedDemo", () => {
  afterAll(() => sql.end());

  it("renews finite bearer access for thirty real days when a demo resets", async () => {
    const before = Date.now();
    await seedDemo(databaseUrl, "seed-demo-test-secret");
    const after = Date.now();
    const rows = await sql<
      { expiry: Date }[]
    >`select link_token_expires_at as expiry from public.invitations where home_id=${DEMO_SEED.home.id}`;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.expiry.getTime()).toBeGreaterThanOrEqual(
        before + 30 * 86_400_000,
      );
      expect(row.expiry.getTime()).toBeLessThanOrEqual(after + 30 * 86_400_000);
    }
    await sql`update public.invitations set link_token_expires_at='2001-01-01',link_token_revoked_at=now() where home_id=${DEMO_SEED.home.id}`;
    await seedDemo(databaseUrl, "seed-demo-test-secret");
    const [restored] = await sql<
      { live: number }[]
    >`select count(*)::int as live from public.invitations where home_id=${DEMO_SEED.home.id} and link_token_expires_at>now() and link_token_revoked_at is null`;
    expect(restored?.live).toBe(2);
  });

  it("removes every agent session linked to an earlier demo run", async () => {
    await seedDemo(databaseUrl, "seed-demo-test-secret");
    const sessionId = "tick_40000000-0000-4000-8000-000000000999";
    await sql`
      insert into public.runs (home_id, session_id, task, status)
      values (${DEMO_SEED.home.id}, ${sessionId}, 'tick', 'completed')
    `;
    await sql`
      insert into public.agent_sessions (key, session_id, data)
      values ('tick-test-state', ${sessionId}, ${Buffer.from("state")})
    `;

    await seedDemo(databaseUrl, "seed-demo-test-secret");

    expect(
      await sql`
        select key from public.agent_sessions where session_id = ${sessionId}
      `,
    ).toHaveLength(0);
  });

  it("restores invitation-scoped links and stable host identities", async () => {
    const secret = "seed-demo-test-secret";
    await seedDemo(databaseUrl, secret);

    const invitations = await sql<
      { id: string; link_token: string; link_token_revoked_at: Date | null }[]
    >`
      select id, link_token, link_token_revoked_at
      from public.invitations
      where home_id = ${DEMO_SEED.home.id}
      order by id
    `;
    expect(invitations).toEqual(
      DEMO_SEED.parties
        .map((party) => ({
          id: party.invitation.id,
          link_token: hashLinkToken(party.guestLink.split("/").at(-1)!, secret),
          link_token_revoked_at: null,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );

    const claims = await sql<
      { normalized_email: string; host_id: string; home_id: string }[]
    >`
      select normalized_email, host_id, home_id
      from public.host_identity_claims
      where home_id = ${DEMO_SEED.home.id}
      order by normalized_email
    `;
    expect(claims).toEqual(
      DEMO_SEED.hosts
        .flatMap((host) =>
          host.emails.map((email) => ({
            normalized_email: email,
            host_id: host.id,
            home_id: DEMO_SEED.home.id,
          })),
        )
        .sort((left, right) =>
          left.normalized_email.localeCompare(right.normalized_email),
        ),
    );
  });

  it("restores the synthetic room proof inventory exactly", async () => {
    await seedDemo(databaseUrl, "seed-demo-test-secret");

    const rooms = await sql<
      {
        id: string;
        guest_label: string;
        beds: number;
        maximum_capacity: number;
        inventory_state: string;
        overflow_policy: string;
        overflow_arrangement: string | null;
      }[]
    >`
      select id, guest_label, beds, maximum_capacity, inventory_state,
        overflow_policy, overflow_arrangement
      from public.rooms
      where home_id = ${DEMO_SEED.home.id}
      order by display_order, id
    `;

    expect(rooms).toEqual(
      DEMO_SEED.rooms.map((room) => ({
        id: room.id,
        guest_label: room.guestLabel,
        beds: room.beds,
        maximum_capacity: room.maximumCapacity,
        inventory_state: room.inventoryState,
        overflow_policy: room.overflowPolicy,
        overflow_arrangement: room.overflowArrangement,
      })),
    );
  });

  it("seeds exactly the two real host identities", async () => {
    await seedDemo(databaseUrl, "seed-demo-test-secret");

    const hosts = await sql<
      { normalized_email: string; display_name: string; host_id: string }[]
    >`
      select claim.normalized_email, host.display_name, claim.host_id
      from public.host_identity_claims as claim
      join public.hosts as host
        on host.id = claim.host_id
       and host.home_id = claim.home_id
      where claim.home_id = ${DEMO_SEED.home.id}
      order by claim.normalized_email
    `;

    expect(hosts).toEqual([
      {
        normalized_email: "jordanlynn5@gmail.com",
        display_name: "Jordan Lynn",
        host_id: "00000000-0000-4000-8000-000000000202",
      },
      {
        normalized_email: "juan294@gmail.com",
        display_name: "Juan González",
        host_id: "00000000-0000-4000-8000-000000000201",
      },
    ]);
  });

  it("preserves an operator login across demo resets", async () => {
    const userId = randomUUID();
    await seedDemo(databaseUrl, "seed-demo-test-secret");

    try {
      await sql`
        insert into auth.users (id, email, aud, role, created_at, updated_at)
        values (
          ${userId},
          'jordanlynn5@gmail.com',
          'authenticated',
          'authenticated',
          now(),
          now()
        )
      `;

      expect(
        await claimHostIdentity(sql, userId, "jordanlynn5@gmail.com"),
      ).toBe("00000000-0000-4000-8000-000000000202");

      await seedDemo(databaseUrl, "seed-demo-test-secret");

      const [operator] = await sql<
        { auth_user_id: string | null; display_name: string }[]
      >`
        select host.auth_user_id, host.display_name
        from public.hosts as host
        where host.id = '00000000-0000-4000-8000-000000000202'
      `;
      expect(operator).toEqual({
        auth_user_id: userId,
        display_name: "Jordan Lynn",
      });
    } finally {
      await sql`delete from auth.users where id = ${userId}`;
    }
  });
});
