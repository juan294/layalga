import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, expect, it, vi } from "vitest";

import { closeDatabase } from "@/core/db/client";
import { findInvitationByToken } from "@/core/booking/invitations";
import { createFixtureHousehold } from "@/test-support/fixture-household";

const session = vi.hoisted(() => ({ hostId: "", homeId: "" }));
vi.mock("@/lib/auth/current-host", () => ({
  requireHost: async () => ({ id: session.hostId, homeId: session.homeId }),
}));
import { revealCapturedInvitationAction } from "./actions";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
afterAll(async () => {
  await closeDatabase();
  await sql.end();
});

it("reveals a completed legacy capture through its creator's server action", async () => {
  const home = await createFixtureHousehold(sql, {
    label: `Legacy reveal ${randomUUID()}`,
    tokenSecret: process.env.LINK_TOKEN_SECRET!,
  });
  try {
    session.hostId = home.hostIds[0]!;
    session.homeId = home.homeId;
    const guest = home.parties[0]!;
    const runId = randomUUID();
    const task = {
      task: "host_capture",
      hostId: session.hostId,
      homeId: home.homeId,
      rawMessage: "Invite friends",
      locale: "en",
    };
    await sql`insert into public.runs (id, home_id, task, session_id, status, payload)
      values (${runId}, ${home.homeId}, 'host_capture', ${`capture_${session.hostId}`}, 'completed', ${sql.json(task)})`;
    await sql`insert into public.audit_events (home_id, run_id, actor, kind, payload)
      values (${home.homeId}, ${runId}, 'agent', 'tool_call', ${sql.json({ name: "capture_invitation", invitationId: guest.invitationId })})`;
    const form = new FormData();
    form.set("locale", "en");
    form.set("runId", runId);
    const result = await revealCapturedInvitationAction(
      { status: "idle" },
      form,
    );
    expect(result.status).toBe("success");
    if (result.status !== "success")
      throw new Error("Expected the captured link");
    const token = new URL(result.guestLink).pathname.split("/").at(-1)!;
    expect((await findInvitationByToken(sql, token))?.id).toBe(
      guest.invitationId,
    );
  } finally {
    await home.cleanup();
  }
});
