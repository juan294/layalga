import postgres from "postgres";

import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "../deps";
import { runAgentTask } from "../run-task";
import { ScriptedModel } from "../scripted-model";

const [sessionId, interruptId, responseJson, homeId] = process.argv.slice(2);
if (!sessionId || !interruptId || !responseJson || !homeId) {
  throw new Error("Expected sessionId, interruptId, response JSON, and homeId");
}
const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  { prepare: false },
);
try {
  const result = await runAgentTask(
    {
      task: "resume",
      homeId,
      sessionId,
      responses: [{ interruptId, response: JSON.parse(responseJson) }],
    },
    {
      db: sql,
      clock: new FakeClock(new Date("2026-09-07T08:00:00Z")),
      scheduler: new NoopScheduler(),
      appUrl: "http://localhost:3000",
      locale: "en",
      model: new ScriptedModel([{ text: "Hold placed and awaiting confirmation." }]),
    },
  );
  process.stdout.write(JSON.stringify(result));
} finally {
  await sql.end();
}
