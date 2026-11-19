import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, expect, it, vi } from "vitest";

import { deriveCaptureLink } from "@/core/booking/link-tokens";
import { SystemClock } from "@/core/clock";
import { createFixtureHousehold } from "@/test-support/fixture-household";

import { NoopScheduler } from "./deps";
import {
  executeQueuedAgentRun,
  retryHostCaptureRun,
  runAgentTask,
} from "./run-task";
import { ScriptedModel } from "./scripted-model";

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  { prepare: false },
);
afterAll(() => sql.end());

it("fails a capture when its audit cannot be written and repairs the same invitation on retry", async () => {
  const secret = randomUUID();
  const home = await createFixtureHousehold(sql, {
    label: `Capture audit retry ${randomUUID()}`,
    tokenSecret: secret,
    parties: [],
  });
  const task = {
    task: "host_capture_v2" as const,
    homeId: home.homeId,
    hostId: home.hostIds[0]!,
    captureId: randomUUID(),
    partyChoice: { kind: "new" as const },
    locale: "en" as const,
    rawMessage: "Invite Birch for the weekend.",
  };
  const runtime = () => ({
    db: sql,
    clock: new SystemClock(),
    scheduler: new NoopScheduler(),
    appUrl: "http://localhost:3008",
    locale: task.locale,
    model: new ScriptedModel([
      {
        toolUse: {
          name: "capture_invitation",
          input: {
            partyName: "Birch",
            partyLocale: task.locale,
            adults: 2,
            flexibleDates: { text: "a weekend" },
            rawMessage: task.rawMessage,
          },
        },
      },
      { text: "Invitation recorded." },
    ]),
  });
  const constraint = `audit_fault_${randomUUID().replaceAll("-", "")}`;
  vi.stubEnv("LINK_TOKEN_SECRET", secret);
  try {
    // PostgreSQL does not accept bind parameters inside a CHECK definition.
    // Quote the identifier and the fixture UUID server-side. The check applies
    // only to this home's capture event after the invitation has committed.
    const [ddl] = await sql<{ command: string }[]>`select format(
      'alter table public.audit_events add constraint %I check (
        home_id <> %L::uuid or kind <> ''tool_call'' or payload->>''name'' is distinct from ''capture_invitation''
        or not (payload ? ''invitationId'')) not valid',
      ${constraint}::text, ${home.homeId}::uuid) as command`;
    await sql.unsafe(ddl!.command);
    const first = await runAgentTask(task, runtime()).catch(() => null);
    const [run] = await sql<{ id: string; status: string }[]>`
      select id, status from public.runs where home_id=${home.homeId}`;
    const invitations = await sql<{ id: string; link_generation: string }[]>`
      select id, link_generation from public.invitations where capture_run_id=${run!.id}`;
    expect(invitations).toHaveLength(1);
    expect(run!.status).toBe("failed");
    expect(first).toBeNull();

    await sql`alter table public.audit_events drop constraint ${sql(constraint)}`;
    expect(
      await retryHostCaptureRun(
        sql,
        { id: task.hostId, homeId: task.homeId },
        run!.id,
      ),
    ).toEqual(task);
    const completed = await executeQueuedAgentRun(run!.id, runtime());
    expect(completed).toMatchObject({ runId: run!.id, status: "completed" });
    expect(
      await sql`select id from public.parties where home_id=${home.homeId}`,
    ).toHaveLength(1);
    expect(
      await sql`select id from public.invitations where home_id=${home.homeId}`,
    ).toEqual([{ id: invitations[0]!.id }]);
    const events =
      await sql`select payload from public.audit_events where run_id=${run!.id}`;
    expect(
      events.filter(
        (event) =>
          event.payload.name === "capture_invitation" &&
          event.payload.invitationId === invitations[0]!.id,
      ),
    ).toHaveLength(1);
    const [stored] = await sql`select * from public.runs where id=${run!.id}`;
    expect(stored).toMatchObject({
      status: "completed",
      request_attempt_count: 2,
    });
    const { token } = deriveCaptureLink(
      secret,
      invitations[0]!.id,
      invitations[0]!.link_generation,
    );
    expect(JSON.stringify({ events, stored })).not.toContain(token);
  } finally {
    try {
      await sql`alter table public.audit_events drop constraint if exists ${sql(constraint)}`;
    } finally {
      vi.unstubAllEnvs();
      await home.cleanup();
    }
  }
});
