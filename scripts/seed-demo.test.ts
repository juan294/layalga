import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

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
});
