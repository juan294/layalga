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
    hosts: 2,
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
    const reveal = () =>
      revealCapturedInvitationAction({ status: "idle" }, form);
    const restricted = { status: "unavailable", reason: "unknown" };
    session.hostId = home.hostIds[1]!;
    expect(await reveal()).toEqual(restricted);
    session.hostId = home.hostIds[0]!;
    const storeAudit = async (
      invitationId: string,
    ) => sql`insert into public.audit_events(home_id,run_id,actor,kind,payload)
      values(${home.homeId},${runId},'agent','tool_call',${sql.json({ name: "capture_invitation", invitationId })})`;
    await storeAudit(home.parties[1]!.invitationId);
    expect(await reveal()).toEqual(restricted);
    await sql`delete from public.audit_events where run_id=${runId}`;
    expect(await reveal()).toEqual(restricted);
    await storeAudit(guest.invitationId);
    await storeAudit(guest.invitationId);
    await sql`update public.invitations set link_token_expires_at=now()+interval '90 days' where id=${guest.invitationId}`;
    const [before] =
      await sql`select link_token_expires_at from public.invitations where id=${guest.invitationId}`;
    const [contact] =
      await sql`insert into public.guest_contacts(home_id,invitation_id,party_id,email,locale,consent,verified_at,requested_at,rate_window_at)
      values(${home.homeId},${guest.invitationId},${guest.partyId},'guest@fixture.test','en',true,now(),now(),now()) returning id`;
    const {
      loadLiveGuestContact,
      mintGuestCapability,
      resolveGuestReturnCapability,
    } = await import("@/core/notifications/guest-contact");
    const now = new Date();
    const capability = mintGuestCapability(
      (await loadLiveGuestContact(sql, contact!.id, now))!,
      "return",
      now,
    );
    expect(await resolveGuestReturnCapability(sql, capability)).toBeTruthy();
    for (const kind of ["host_capture", "host_capture_v2"]) {
      const contradictory = {
        ...task,
        task: kind,
        captureId: randomUUID(),
        partyChoice: {
          kind: "returning",
          partyId: guest.partyId,
          unexpected: true,
        },
      };
      await sql`update public.runs set task=${kind}, payload=${sql.json(contradictory)} where id=${runId}`;
      expect(await reveal()).toEqual(restricted);
      expect((await findInvitationByToken(sql, guest.token))?.id).toBe(
        guest.invitationId,
      );
    }
    await sql`update public.runs set task='host_capture', payload=${sql.json(task)} where id=${runId}`;
    const prompt = await revealCapturedInvitationAction(
      { status: "idle" },
      form,
    );
    expect(prompt.status).toBe("legacy");
    expect((await findInvitationByToken(sql, guest.token))?.id).toBe(
      guest.invitationId,
    );
    form.set("confirmReplacement", "yes");
    const [result, concurrent] = await Promise.all([reveal(), reveal()]);
    expect(concurrent).toEqual(result);
    expect(await resolveGuestReturnCapability(sql, capability)).toBeNull();
    const [after] =
      await sql`select link_token_expires_at from public.invitations where id=${guest.invitationId}`;
    expect(after).toEqual(before);
    expect(result.status).toBe("success");
    if (result.status !== "success")
      throw new Error("Expected the captured link");
    const again = await revealCapturedInvitationAction(
      { status: "idle" },
      form,
    );
    expect(again).toEqual(result);
    expect(await findInvitationByToken(sql, guest.token)).toBeNull();
    const token = new URL(result.guestLink).pathname.split("/").at(-1)!;
    expect((await findInvitationByToken(sql, token))?.id).toBe(
      guest.invitationId,
    );
    const snapshot = async () =>
      (
        await sql`select to_jsonb(i) as data from public.invitations i where id=${guest.invitationId}`
      )[0];
    const original = await snapshot();
    await sql`update public.parties set locale=case locale when 'en' then 'es' else 'en' end where id=${guest.partyId}`;
    await sql`update public.runs set payload='{}',result=null where id=${runId}`;
    await sql`delete from public.audit_events where run_id=${runId}`;
    expect(await reveal()).toEqual(result);
    expect(await snapshot()).toEqual(original);
    expect(JSON.stringify(original)).not.toContain(token);
    await sql`update public.runs set status='failed' where id=${runId}`;
    expect(await reveal()).toEqual(restricted);
    await sql`update public.runs set status='completed', task='host_capture_v2',payload=${sql.json({ ...task, task: "host_capture_v2", captureId: randomUUID(), partyChoice: { kind: "returning", partyId: home.parties[1]!.partyId } })} where id=${runId}`;
    expect(await reveal()).toEqual(restricted);
    await sql`update public.runs set payload='{}' where id=${runId}`;
    await sql`update public.invitations set link_generation=gen_random_uuid() where id=${guest.invitationId}`;
    expect(await reveal()).toEqual(restricted);
    await sql`update public.invitations set link_token_expires_at=now() where id=${guest.invitationId}`;
    expect(await reveal()).toEqual({
      status: "unavailable",
      reason: "expired",
    });
    await sql`update public.invitations set link_token_revoked_at=now() where id=${guest.invitationId}`;
    expect(await reveal()).toEqual({
      status: "unavailable",
      reason: "revoked",
    });
    await sql`update public.invitations set status='cancelled' where id=${guest.invitationId}`;
    expect(await reveal()).toEqual({
      status: "unavailable",
      reason: "cancelled",
    });
  } finally {
    await home.cleanup();
  }
});

it("retries a failed legacy capture by its exact id within the original attempt limit", async () => {
  const { retryHostCaptureRun } = await import("@/agent/run-task");
  const home = await createFixtureHousehold(sql, {
    label: "Exact retry " + randomUUID(),
    tokenSecret: process.env.LINK_TOKEN_SECRET!,
  });
  try {
    const id = randomUUID();
    const host = { id: home.hostIds[0]!, homeId: home.homeId };
    const payload = {
      task: "host_capture",
      homeId: home.homeId,
      hostId: host.id,
      locale: "en",
      rawMessage: "Invite friends",
    };
    await sql`insert into public.runs(id,home_id,session_id,task,status,payload,request_attempt_count)
      values(${id},${home.homeId},${"capture_" + host.id},'host_capture','failed',${sql.json(payload)},2)`;
    expect(await retryHostCaptureRun(sql, host, id)).toMatchObject(payload);
    expect(
      (
        await sql`select status,request_attempt_count from public.runs where id=${id}`
      )[0],
    ).toEqual({ status: "queued", request_attempt_count: 3 });
    await sql`update public.runs set status='failed' where id=${id}`;
    expect(await retryHostCaptureRun(sql, host, id)).toBeNull();
  } finally {
    await home.cleanup();
  }
});
