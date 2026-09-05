import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { FakeClock } from "@/core/clock";

import { dispatchHostEmailPings } from "./email-outbox";
import type { EmailMessage, EmailSendResult } from "./ses-client";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(databaseUrl, { prepare: false });

const homeId = "50000000-0000-4000-8000-000000000001";
const hostIds = [
  "50000000-0000-4000-8000-000000000201",
  "50000000-0000-4000-8000-000000000202",
] as const;
const hostEmails = [
  "outbox-host-1@example.com",
  "outbox-host-2@example.com",
] as const;
const partyId = "50000000-0000-4000-8000-000000000301";
const invitationId = "50000000-0000-4000-8000-000000000401";
const visitId = "50000000-0000-4000-8000-000000000501";
const runId = "50000000-0000-4000-8000-000000000601";
const decisionId = "50000000-0000-4000-8000-000000000701";

function fakeSend(result: () => Promise<EmailSendResult> | EmailSendResult): {
  send: (message: EmailMessage) => Promise<EmailSendResult>;
  calls: EmailMessage[];
} {
  const calls: EmailMessage[] = [];
  return {
    calls,
    send: async (message) => {
      calls.push(message);
      return result();
    },
  };
}

describe("email outbox", () => {
  beforeEach(async () => {
    await sql`delete from public.homes where id = ${homeId}`;
    await sql`insert into public.homes (id, name, timezone) values (${homeId}, 'Outbox home', 'Europe/Madrid')`;
    await sql`
      insert into public.hosts (id, home_id, display_name, locale)
      values
        (${hostIds[0]}, ${homeId}, 'Host One', 'en'),
        (${hostIds[1]}, ${homeId}, 'Host Two', 'es')
    `;
    await sql`
      insert into public.host_identity_claims (normalized_email, host_id, home_id)
      values
        (${hostEmails[0]}, ${hostIds[0]}, ${homeId}),
        (${hostEmails[1]}, ${hostIds[1]}, ${homeId})
    `;
    await sql`
      insert into public.parties (id, home_id, family_name, locale, link_token)
      values (${partyId}, ${homeId}, 'Outbox Family', 'en', 'outbox-token')
    `;
    await sql`
      insert into public.invitations (id, home_id, host_id, party_id, raw_message)
      values (${invitationId}, ${homeId}, ${hostIds[0]}, ${partyId}, 'raw')
    `;
    await sql`
      insert into public.visits (
        id, home_id, party_id, invitation_id, stay, adults, children, pets, status
      ) values (
        ${visitId}, ${homeId}, ${partyId}, ${invitationId},
        daterange('2026-09-18', '2026-09-21', '[)'), 2, 0, 0, 'hold'
      )
    `;
    await sql`
      insert into public.runs (id, home_id, session_id, task, status)
      values (${runId}, ${homeId}, 'outbox-session', 'host_capture', 'interrupted')
    `;
    await sql`
      insert into public.pending_decisions (
        id, home_id, visit_id, run_id, agent_session_id, interrupt_id,
        interrupt_name, reason, status
      ) values (
        ${decisionId}, ${homeId}, ${visitId}, ${runId}, 'outbox-session', 'interrupt-1',
        'host_decision',
        ${JSON.stringify({
          reason: "children",
          requestedDraft: {
            stay: ["2026-09-18", "2026-09-21"],
            adults: 2,
            children: 0,
            pets: 0,
            specialRequests: [],
          },
        })}::text::jsonb,
        'pending'
      )
    `;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(() => sql.end());

  function stubEmailEnv() {
    vi.stubEnv("EMAIL", "ses");
    vi.stubEnv("SES_FROM_ADDRESS", "noreply@layalga.example");
    vi.stubEnv("AWS_REGION", "us-east-1");
    vi.stubEnv("APP_URL", "http://localhost:3008");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", undefined);
  }

  it("sends one email per host for one pending decision", async () => {
    stubEmailEnv();
    const clock = new FakeClock(new Date("2026-09-10T09:00:00Z"));
    const { send, calls } = fakeSend(() => ({ messageId: "msg-1" }));

    const result = await dispatchHostEmailPings(sql, clock, send);

    expect(result.sent).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.toAddress).sort()).toEqual([...hostEmails]);
    for (const call of calls) {
      expect(call.text).not.toMatch(/token/i);
      expect(call.text).not.toMatch(/calendar/i);
    }

    const rows = await sql<{ status: string; to_address: string }[]>`
      select status, to_address from public.host_email_pings
      where home_id = ${homeId}
      order by to_address
    `;
    expect(rows).toEqual([
      { status: "sent", to_address: hostEmails[0] },
      { status: "sent", to_address: hostEmails[1] },
    ]);
  });

  it("skips a host who turned consent off", async () => {
    stubEmailEnv();
    await sql`
      insert into public.host_notification_settings (host_id, home_id, email_pings)
      values (${hostIds[1]}, ${homeId}, false)
    `;
    const clock = new FakeClock(new Date("2026-09-10T09:00:00Z"));
    const { send, calls } = fakeSend(() => ({ messageId: "msg-1" }));

    const result = await dispatchHostEmailPings(sql, clock, send);

    expect(result.sent).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.toAddress).toBe(hostEmails[0]);
  });

  it("sends nothing on a second run", async () => {
    stubEmailEnv();
    const clock = new FakeClock(new Date("2026-09-10T09:00:00Z"));
    await dispatchHostEmailPings(
      sql,
      clock,
      fakeSend(() => ({ messageId: "msg-1" })).send,
    );

    const { send, calls } = fakeSend(() => ({ messageId: "msg-2" }));
    const result = await dispatchHostEmailPings(sql, clock, send);

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(2);
    expect(calls).toHaveLength(0);
  });

  it("retries a failed row after five minutes but not before", async () => {
    stubEmailEnv();
    const clock = new FakeClock(new Date("2026-09-10T09:00:00Z"));
    let attempt = 0;
    const failThenSucceed = async (): Promise<EmailSendResult> => {
      attempt += 1;
      if (attempt === 1) throw new Error("SES throttled");
      return { messageId: "msg-retry" };
    };
    const calls: EmailMessage[] = [];
    const trackedSend = async (message: EmailMessage) => {
      calls.push(message);
      return failThenSucceed();
    };

    const first = await dispatchHostEmailPings(sql, clock, trackedSend);
    expect(first.sent).toBe(1);
    expect(calls).toHaveLength(2);

    const failedRow = await sql<{ id: string; status: string }[]>`
      select id, status from public.host_email_pings
      where home_id = ${homeId} and status = 'failed'
    `;
    expect(failedRow).toHaveLength(1);

    clock.advance(2 * 60 * 1_000);
    const tooSoon = await dispatchHostEmailPings(sql, clock, trackedSend);
    expect(tooSoon.sent).toBe(0);
    expect(calls).toHaveLength(2);

    clock.advance(4 * 60 * 1_000);
    const retried = await dispatchHostEmailPings(sql, clock, trackedSend);
    expect(retried.sent).toBe(1);
    expect(calls).toHaveLength(3);

    const rows = await sql<{ status: string }[]>`
      select status from public.host_email_pings where home_id = ${homeId}
    `;
    expect(rows.every((row) => row.status === "sent")).toBe(true);
  });

  it("retires an obsolete claimed ping when a visit is cancelled between recipients", async () => {
    stubEmailEnv();
    const clock = new FakeClock(new Date("2026-09-10T09:00:00Z"));
    const { send, calls } = fakeSend(async () => {
      await sql`update public.visits set status = 'cancelled' where id = ${visitId}`;
      return { messageId: "msg-before-cancellation" };
    });

    const result = await dispatchHostEmailPings(sql, clock, send);

    expect(result).toEqual({ sent: 1, skipped: 1 });
    expect(calls).toHaveLength(1);
    const [retired] = await sql<{
      status: string;
      error_name: string | null;
      message_id: string | null;
    }[]>`
      select status, error_name, message_id from public.host_email_pings
      where home_id = ${homeId} and host_id = ${hostIds[1]}
    `;
    expect(retired).toEqual({
      status: "failed",
      error_name: "ObsoleteNotification",
      message_id: null,
    });

    // Even if the source later becomes eligible again, this retired delivery
    // must not be mistaken for a transient SES failure and retried.
    await sql`update public.visits set status = 'hold' where id = ${visitId}`;
    clock.advance(6 * 60 * 1_000);
    const retry = await dispatchHostEmailPings(sql, clock, send);
    expect(retry.sent).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it("suppresses historical escalation after visit cancellation", async () => {
    stubEmailEnv();
    await sql`update public.pending_decisions set status = 'declined' where id = ${decisionId}`;
    await sql`update public.visits set status = 'cancelled' where id = ${visitId}`;
    await sql`
      insert into public.notifications (home_id, recipient_kind, recipient_id, visit_id, kind, body_en, body_es)
      values (${homeId}, 'host', ${hostIds[0]}, ${visitId}, 'reconfirm_escalation', 'Please review', 'Revisa')
    `;
    const { send, calls } = fakeSend(() => ({ messageId: "must-not-send" }));
    const clock = new FakeClock(new Date("2026-09-10T09:00:00Z"));
    expect((await dispatchHostEmailPings(sql, clock, send)).sent).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("never selects a guest as a recipient", async () => {
    stubEmailEnv();
    const clock = new FakeClock(new Date("2026-09-10T09:00:00Z"));
    const { send, calls } = fakeSend(() => ({ messageId: "msg-1" }));

    await dispatchHostEmailPings(sql, clock, send);

    for (const call of calls) {
      expect(hostEmails).toContain(call.toAddress);
    }
  });
});
