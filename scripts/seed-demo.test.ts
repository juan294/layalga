import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { hashLinkToken } from "@/core/booking/invitations";
import { claimHostIdentity } from "@/lib/auth/host-identity";

import { DEMO_SEED, SEEDED_HOSTS, seedDemo } from "./seed-demo";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false });

describe("seedDemo", () => {
  afterAll(() => sql.end());

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
      SEEDED_HOSTS
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

  it("keeps the real operators separate from synthetic demo hosts", async () => {
    await seedDemo(databaseUrl, "seed-demo-test-secret");

    const operators = await sql<
      { normalized_email: string; display_name: string; host_id: string }[]
    >`
      select claim.normalized_email, host.display_name, claim.host_id
      from public.host_identity_claims as claim
      join public.hosts as host
        on host.id = claim.host_id
       and host.home_id = claim.home_id
      where claim.normalized_email in (
        'juan294@gmail.com',
        'jordanlynn5@gmail.com'
      )
      order by claim.normalized_email
    `;

    expect(operators).toEqual([
      {
        normalized_email: "jordanlynn5@gmail.com",
        display_name: "Jordan Lynn",
        host_id: "00000000-0000-4000-8000-000000000212",
      },
      {
        normalized_email: "juan294@gmail.com",
        display_name: "Juan González",
        host_id: "00000000-0000-4000-8000-000000000211",
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
        await claimHostIdentity(
          sql,
          userId,
          "jordanlynn5@gmail.com",
        ),
      ).toBe("00000000-0000-4000-8000-000000000212");

      await seedDemo(databaseUrl, "seed-demo-test-secret");

      const [operator] = await sql<
        { auth_user_id: string | null; display_name: string }[]
      >`
        select host.auth_user_id, host.display_name
        from public.hosts as host
        where host.id = '00000000-0000-4000-8000-000000000212'
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
