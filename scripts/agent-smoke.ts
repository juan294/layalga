import { SystemClock } from "@/core/clock";
import { closeDatabase, getDatabaseConnection } from "@/core/db/client";
import { NoopScheduler } from "@/agent/deps";
import { runAgentTask } from "@/agent/run-task";

const homeId = "00000000-0000-4000-8000-000000000001";
const hostId = "00000000-0000-4000-8000-000000000201";
const rawMessage =
  "Oye, los Vega quieren venir a la casa un finde de septiembre, son Marta y Xuan con los dos crios. Les va mejor mediados de mes.";

const connection = getDatabaseConnection();
try {
  const result = await runAgentTask(
    { task: "host_capture", homeId, hostId, rawMessage, locale: "es" },
    {
      db: connection.db,
      clock: new SystemClock(),
      scheduler: new NoopScheduler(),
      appUrl: process.env.APP_URL ?? "http://localhost:3000",
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
  await closeDatabase();
}
