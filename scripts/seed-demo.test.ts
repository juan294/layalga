import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { hashLinkToken } from "@/core/booking/invitations";

import { DEMO_SEED, seedDemo } from "./seed-demo";

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
});
