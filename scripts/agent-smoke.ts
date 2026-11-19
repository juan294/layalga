import { randomUUID } from "node:crypto";
import { createFixtureHousehold } from "@/test-support/fixture-household";
import { SystemClock } from "@/core/clock";
import { closeDatabase, getDatabaseConnection } from "@/core/db/client";
import { NoopScheduler } from "@/agent/deps";
import { runAgentTask } from "@/agent/run-task";

const connection = getDatabaseConnection();
const household = await createFixtureHousehold(connection.sql, {
  label: `Local smoke ${randomUUID()}`,
  tokenSecret: process.env.LINK_TOKEN_SECRET!,
  parties: [],
});
const homeId = household.homeId;
const hostId = household.hostIds[0]!;
const rawMessage = `Invite our guests for a September weekend.${household.tag}`;
try {
  const result = await runAgentTask(
    {
      task: "host_capture_v2",
      captureId: randomUUID(),
      partyChoice: { kind: "new" },
      homeId,
      hostId,
      rawMessage,
      locale: "es",
    },
    {
      db: connection.db,
      clock: new SystemClock(),
      scheduler: new NoopScheduler(),
      appUrl: process.env.APP_URL ?? "http://localhost:3008",
      locale: "es",
    },
  );
  const [invitation] = await connection.sql<
    { id: string; structured: unknown }[]
  >`
    select id, structured from public.invitations
    where home_id = ${homeId} and raw_message = ${rawMessage}
    order by created_at desc limit 1
  `;
  console.log(JSON.stringify({ result, invitation }, null, 2));
} finally {
  await household.cleanup();
  await closeDatabase();
}
