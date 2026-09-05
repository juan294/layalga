import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { FakeClock } from "../clock";
import {
  registerGuestContact,
  loadGuestContact,
  inspectGuestVerification,
  verifyGuestContact,
  resolveGuestReturnCapability,
  disableGuestContact,
} from "./guest-contact";
import {
  dispatchGuestEmailPings,
  loadGuestDeliveryFacts,
} from "./guest-outbox";

const db = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  { prepare: false, max: 5 },
);
const secret = "guest-delivery-test-secret-at-least-32-bytes";
const clock = () => new FakeClock(new Date("2026-09-10T09:00:00Z"));
afterAll(() => db.end({ timeout: 5 }));
afterEach(() => vi.unstubAllEnvs());
async function fixture(demo = false) {
  const homeId = randomUUID(),
    hostId = randomUUID(),
    partyId = randomUUID(),
    invitationId = randomUUID();
  await db`insert into public.homes(id,name,timezone,demo) values(${homeId},${homeId},'Europe/Madrid',${demo})`;
  await db`insert into public.hosts(id,home_id,display_name,locale) values(${hostId},${homeId},'Host','en')`;
  await db`insert into public.parties(id,home_id,family_name,locale) values(${partyId},${homeId},'Private Family','en')`;
  await db`insert into public.invitations(id,home_id,host_id,party_id,raw_message,link_token,link_token_expires_at) values(${invitationId},${homeId},${hostId},${partyId},'Private invitation',${randomUUID()},'2027-01-01')`;
  return { homeId, hostId, partyId, invitationId };
}
function emailEnv() {
  vi.stubEnv("SES_REGION", "us-east-1");
  vi.stubEnv("EMAIL", "ses");
  vi.stubEnv("SES_FROM_ADDRESS", "noreply@example.test");
  vi.stubEnv("APP_URL", "https://example.test");
  vi.stubEnv("LINK_TOKEN_SECRET", secret);
}

async function chase(f: Awaited<ReturnType<typeof fixture>>, now: Date) {
  const visitId = randomUUID(),
    jobId = randomUUID(),
    notificationId = randomUUID();
  await db`insert into public.visits(id,home_id,party_id,invitation_id,stay,adults,status,reconfirm_requested_at) values(${visitId},${f.homeId},${f.partyId},${f.invitationId},daterange('2026-09-13','2026-09-16','[)'),2,'reconfirm_pending',${now.toISOString()})`;
  await db`insert into public.scheduled_jobs(id,home_id,visit_id,kind,due_at,status) values(${jobId},${f.homeId},${visitId},'reconfirm_chase',${now.toISOString()},'done')`;
  await db`insert into public.notifications(id,home_id,recipient_kind,recipient_id,visit_id,scheduled_job_id,kind,body_en,body_es,created_at) values(${notificationId},${f.homeId},'party',${f.partyId},${visitId},${jobId},'reconfirm_chase','Confirm','Confirma',${now.toISOString()})`;
  return { visitId, jobId, notificationId };
}

describe("consented guest delivery", () => {
  it.each(["authorized", "accepted_after_sweep"] as const)(
    "never reclaims an indeterminate send when a lease expires after the startup sweep (%s)",
    async (mode) => {
      const first = await fixture(),
        second = await fixture(),
        time = clock();
      emailEnv();
      try {
        await registerGuestContact(
          db,
          {
            ...first,
            email: "first@example.test",
            locale: "en",
            consent: true,
          },
          time,
          secret,
        );
        await registerGuestContact(
          db,
          {
            ...second,
            email: "second@example.test",
            locale: "en",
            consent: true,
            verifiedGoogle: true,
          },
          time,
          secret,
        );
        const source = await chase(second, time.now());
        const [contact] = await db<
          { id: string; generation: number }[]
        >`select id,generation from public.guest_contacts where invitation_id=${second.invitationId}`;
        const token = randomUUID(),
          outboxId = randomUUID();
        await db`insert into public.guest_email_outbox(id,home_id,contact_id,generation,kind,source_id,status,attempts,available_at,created_at,claim_token,lease_until) values(${outboxId},${second.homeId},${contact!.id},${contact!.generation},'reconfirm_chase',${source.notificationId},'sending',1,${time.now().toISOString()},${time.now().toISOString()},${token},${new Date(time.now().getTime() + 60_000).toISOString()})`;
        await db`insert into public.guest_email_attempts(claim_token,outbox_id,home_id,status,authorized_at) values(${token},${outboxId},${second.homeId},${mode === "authorized" ? "authorized" : "failed"},${time.now().toISOString()})`;
        const send = vi.fn(async () => {
          time.advance(2 * 60_000);
          if (mode === "accepted_after_sweep")
            await db`update public.guest_email_attempts set status='accepted',message_id='accepted-while-busy',accepted_at=${time.now().toISOString()} where claim_token=${token}`;
          return { messageId: "first-verification" };
        });
        await dispatchGuestEmailPings(db, time, send);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0]).toBeDefined();
        const [row] = await db<
          { attempts: number }[]
        >`select attempts from public.guest_email_outbox where id=${outboxId}`;
        expect(row?.attempts).toBe(1);
      } finally {
        await db`delete from public.homes where id in (${first.homeId},${second.homeId})`;
      }
    },
  );

  it("cancellation committed before send authorization suppresses the external send", async () => {
    const f = await fixture(),
      time = clock();
    emailEnv();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let acquired!: () => void;
    const locked = new Promise<void>((r) => {
      acquired = r;
    });
    try {
      await registerGuestContact(
        db,
        {
          ...f,
          email: "boundary@example.test",
          locale: "en",
          consent: true,
          verifiedGoogle: true,
        },
        time,
        secret,
      );
      const source = await chase(f, time.now());
      const cancellation = db.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${f.homeId}::text,0))`;
        acquired();
        await gate;
        await tx`update public.visits set status='cancelled' where id=${source.visitId}`;
      });
      await locked;
      const send = vi.fn().mockResolvedValue({ messageId: "must-not-send" });
      const dispatch = dispatchGuestEmailPings(db, time, send);
      try {
        let claimed = false;
        const deadline = Date.now() + 2000;
        while (!claimed && Date.now() < deadline) {
          const [row] = await db<
            { status: string }[]
          >`select status from public.guest_email_outbox where home_id=${f.homeId}`;
          claimed = row?.status === "sending";
        }
        expect(claimed).toBe(true);
      } finally {
        release();
        await cancellation;
        await dispatch;
      }
      expect(send).not.toHaveBeenCalled();
      const attempts =
        await db`select claim_token from public.guest_email_attempts where home_id=${f.homeId}`;
      expect(attempts).toHaveLength(0);
    } finally {
      release?.();
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });
  it("does not send pre-arrival requests once arrival day begins in household time", async () => {
    const f = await fixture(),
      time = clock();
    emailEnv();
    try {
      await registerGuestContact(
        db,
        {
          ...f,
          email: "arrival@example.test",
          locale: "en",
          consent: true,
          verifiedGoogle: true,
        },
        time,
        secret,
      );
      await chase(f, time.now());
      time.set(new Date("2026-09-12T22:00:00Z"));
      const send = vi.fn().mockRejectedValue(new Error("retry"));
      await dispatchGuestEmailPings(db, time, send);
      expect(send).not.toHaveBeenCalled();
      time.set(new Date("2026-09-10T09:00:00Z"));
      await dispatchGuestEmailPings(db, time, send);
      expect(send).toHaveBeenCalledTimes(1);
      time.set(new Date("2026-09-12T22:00:00Z"));
      await dispatchGuestEmailPings(db, time, send);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });
  it.each([1, 3])(
    "records unknown acceptance when authorized worker attempt %s loses its lease",
    async (attempts) => {
      const f = await fixture(),
        time = clock();
      emailEnv();
      try {
        await registerGuestContact(
          db,
          {
            ...f,
            email: "unknown@example.test",
            locale: "en",
            consent: true,
            verifiedGoogle: true,
          },
          time,
          secret,
        );
        const source = await chase(f, time.now());
        await dispatchGuestEmailPings(db, time, async () => {
          throw new Error("failed first");
        });
        const token = randomUUID();
        const [row] = await db<
          { id: string }[]
        >`update public.guest_email_outbox set status='sending',attempts=${attempts},claim_token=${token},lease_until=${new Date(time.now().getTime() - 1).toISOString()} where home_id=${f.homeId} returning id`;
        await db`insert into public.guest_email_attempts(claim_token,outbox_id,home_id,status,authorized_at) values(${token},${row!.id},${f.homeId},'authorized',${new Date(time.now().getTime() - 5 * 60_000).toISOString()})`;
        const send = vi.fn().mockResolvedValue({ messageId: "must-not-retry" });
        await dispatchGuestEmailPings(db, time, send);
        expect(send).not.toHaveBeenCalled();
        expect(await loadGuestDeliveryFacts(db, f.homeId, time)).toEqual([
          { visitId: source.visitId, status: "unknown", sentAt: null },
        ]);
        const [attempt] =
          await db`select status from public.guest_email_attempts where claim_token=${token}`;
        expect(attempt?.status).toBe("unknown");
        await db`update public.invitations set link_token_revoked_at=${time.now().toISOString()} where id=${f.invitationId}`;
        expect(
          (await loadGuestDeliveryFacts(db, f.homeId, time))[0]?.status,
        ).toBe("unavailable_access");
      } finally {
        await db`delete from public.homes where id=${f.homeId}`;
      }
    },
  );

  it("keeps contact, outbox and attempt tables private to the web runtime", async () => {
    const rows = await db<
      {
        role_name: string;
        table_name: string;
        can_read: boolean;
        can_insert: boolean;
        can_update: boolean;
        can_delete: boolean;
      }[]
    >`
      select role_name,table_name,
        has_table_privilege(role_name,table_name,'SELECT') as can_read,
        has_table_privilege(role_name,table_name,'INSERT') as can_insert,
        has_table_privilege(role_name,table_name,'UPDATE') as can_update,
        has_table_privilege(role_name,table_name,'DELETE') as can_delete
      from unnest(array['layalga_web_runtime','layalga_agent_runtime','anon','authenticated','service_role']) role_name
      cross join unnest(array['public.guest_contacts','public.guest_email_outbox','public.guest_email_attempts']) table_name
    `;
    expect(rows).toHaveLength(15);
    for (const row of rows) {
      const expected = row.role_name === "layalga_web_runtime";
      expect(
        [row.can_read, row.can_insert, row.can_update, row.can_delete],
        `${row.role_name}:${row.table_name}`,
      ).toEqual([
        expected,
        expected,
        expected,
        expected && row.table_name !== "public.guest_email_attempts",
      ]);
    }
    const tables = await db<
      { relrowsecurity: boolean }[]
    >`select relrowsecurity from pg_class where oid in ('public.guest_contacts'::regclass,'public.guest_email_outbox'::regclass,'public.guest_email_attempts'::regclass)`;
    expect(tables).toHaveLength(3);
    expect(tables.every((row) => row.relrowsecurity)).toBe(true);
  });

  it("retains active contacts but deletes terminal contacts after180days and email rows after90days", async () => {
    const old = await fixture(),
      active = await fixture(),
      time = clock();
    const rollback = new Error("rollback retention proof");
    try {
      for (const f of [old, active])
        await registerGuestContact(
          db,
          {
            ...f,
            email: "retention@example.test",
            locale: "en",
            consent: true,
          },
          time,
          secret,
        );
      await db`update public.invitations set status='cancelled' where id=${old.invitationId}`;
      await db`update public.invitations set link_token_expires_at='2029-01-01' where id=${active.invitationId}`;
      await db`insert into public.visits(home_id,party_id,invitation_id,stay,adults,status) values(${active.homeId},${active.partyId},${active.invitationId},daterange('2028-01-01','2028-01-04','[)'),2,'confirmed')`;
      await expect(
        db.begin(async (tx) => {
          await tx`select private.apply_data_retention('2027-09-10T09:00:00Z'::timestamptz)`;
          const contacts = await tx<
            { invitation_id: string }[]
          >`select invitation_id from public.guest_contacts where home_id in (${old.homeId},${active.homeId})`;
          expect(contacts).toEqual([{ invitation_id: active.invitationId }]);
          const mail =
            await tx`select id from public.guest_email_outbox where home_id in (${old.homeId},${active.homeId})`;
          expect(mail).toHaveLength(0);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    } finally {
      await db`delete from public.homes where id in (${old.homeId},${active.homeId})`;
    }
  });

  it("refreshes a reclaimed lease and fences a superseded send acknowledgement", async () => {
    const f = await fixture(),
      time = clock();
    emailEnv();
    try {
      await registerGuestContact(
        db,
        {
          ...f,
          email: "lease@example.test",
          locale: "en",
          consent: true,
          verifiedGoogle: true,
        },
        time,
        secret,
      );
      await chase(f, time.now());
      await dispatchGuestEmailPings(db, time, async () => {
        throw new Error("first failed");
      });
      await db`update public.guest_email_outbox set status='sending',claim_token=${randomUUID()},lease_until=${new Date(time.now().getTime() - 1).toISOString()},available_at=${time.now().toISOString()} where home_id=${f.homeId}`;
      const send = vi.fn(async () => {
        const [row] = await db<
          { lease_until: Date; attempts: number }[]
        >`select lease_until,attempts from public.guest_email_outbox where home_id=${f.homeId}`;
        expect(row?.lease_until.getTime()).toBe(
          time.now().getTime() + 5 * 60_000,
        );
        expect(row?.attempts).toBe(2);
        await disableGuestContact(db, f, time);
        return { messageId: "late-provider-ack" };
      });
      expect((await dispatchGuestEmailPings(db, time, send)).sent).toBe(1);
      const [row] =
        await db`select status,message_id from public.guest_email_outbox where home_id=${f.homeId}`;
      expect(row).toEqual({ status: "cancelled", message_id: null });
      const [receipt] =
        await db`select status,message_id from public.guest_email_attempts where home_id=${f.homeId} and status='accepted'`;
      expect(receipt).toEqual({
        status: "accepted",
        message_id: "late-provider-ack",
      });
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });

  it("sends one current reminder under concurrent dispatch and never resends accepted mail", async () => {
    const f = await fixture(),
      time = clock();
    emailEnv();
    try {
      await registerGuestContact(
        db,
        {
          ...f,
          email: "verified@example.test",
          locale: "es",
          consent: true,
          verifiedGoogle: true,
        },
        time,
        secret,
      );
      const source = await chase(f, time.now());
      const send = vi.fn().mockResolvedValue({ messageId: "reminder-1" });
      const outcomes = await Promise.all([
        dispatchGuestEmailPings(db, time, send),
        dispatchGuestEmailPings(db, time, send),
      ]);
      expect(outcomes.reduce((sum, r) => sum + r.sent, 0)).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0].subject).toContain("viniendo");
      const cap = new URL(
        send.mock.calls[0]?.[0].text.match(/https:\/\/\S+/)[0],
      ).searchParams.get("capability")!;
      expect(
        await resolveGuestReturnCapability(db, cap, time, secret),
      ).toMatchObject({ invitationId: f.invitationId });
      expect(
        await resolveGuestReturnCapability(db, cap + "a", time, secret),
      ).toBeNull();
      expect(await inspectGuestVerification(db, cap, time, secret)).toBeNull();
      expect(await loadGuestDeliveryFacts(db, f.homeId, time)).toEqual([
        {
          visitId: source.visitId,
          status: "sent",
          sentAt: time.now().toISOString(),
        },
      ]);
      await dispatchGuestEmailPings(db, time, send);
      expect(send).toHaveBeenCalledTimes(1);
      // A persisted acceptance receipt recovers a lost outbox acknowledgement
      // without issuing a second network request.
      await db`update public.guest_email_outbox set status='sending',message_id=null,sent_at=null,claim_token=${randomUUID()},lease_until=${new Date(time.now().getTime() - 1).toISOString()} where home_id=${f.homeId}`;
      await dispatchGuestEmailPings(db, time, send);
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        (await loadGuestDeliveryFacts(db, f.homeId, time))[0]?.status,
      ).toBe("sent");
      await db`update public.invitations set link_token=${randomUUID()} where id=${f.invitationId}`;
      expect(
        await resolveGuestReturnCapability(db, cap, time, secret),
      ).toBeNull();
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });
  it("retries with bounded backoff, sanitized failures and a terminal third attempt", async () => {
    const f = await fixture(),
      time = clock();
    emailEnv();
    try {
      await registerGuestContact(
        db,
        {
          ...f,
          email: "verified@example.test",
          locale: "en",
          consent: true,
          verifiedGoogle: true,
        },
        time,
        secret,
      );
      await chase(f, time.now());
      const send = vi.fn().mockRejectedValue(
        Object.assign(new Error("private@example.test"), {
          name: "private@example.test",
        }),
      );
      expect((await dispatchGuestEmailPings(db, time, send)).failed).toBe(1);
      await dispatchGuestEmailPings(db, time, send);
      expect(send).toHaveBeenCalledTimes(1);
      time.advance(5 * 60_000);
      await dispatchGuestEmailPings(db, time, send);
      time.advance(10 * 60_000);
      await dispatchGuestEmailPings(db, time, send);
      time.advance(60 * 60_000);
      await dispatchGuestEmailPings(db, time, send);
      expect(send).toHaveBeenCalledTimes(3);
      const [row] =
        await db`select status,attempts,error_name from public.guest_email_outbox where home_id=${f.homeId}`;
      expect(row).toEqual({
        status: "failed",
        attempts: 3,
        error_name: "EmailSendFailed",
      });
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });
  it.each(["cancelled", "rescheduled", "optout"])(
    "suppresses queued reminders after %s",
    async (change) => {
      const f = await fixture(),
        time = clock();
      emailEnv();
      try {
        await registerGuestContact(
          db,
          {
            ...f,
            email: "verified@example.test",
            locale: "en",
            consent: true,
            verifiedGoogle: true,
          },
          time,
          secret,
        );
        const source = await chase(f, time.now());
        const send = vi.fn().mockRejectedValue(new Error("retry"));
        await dispatchGuestEmailPings(db, time, send);
        if (change === "optout") await disableGuestContact(db, f, time);
        else
          await db`update public.visits set status=${change === "cancelled" ? "cancelled" : "confirmed"},reconfirm_requested_at=null where id=${source.visitId}`;
        time.advance(5 * 60_000);
        await dispatchGuestEmailPings(db, time, send);
        expect(send).toHaveBeenCalledTimes(1);
        const [row] =
          await db`select status from public.guest_email_outbox where home_id=${f.homeId}`;
        expect(row?.status).toBe("cancelled");
      } finally {
        await db`delete from public.homes where id=${f.homeId}`;
      }
    },
  );
  it("expires verification and invalidates prior generations on address change", async () => {
    const f = await fixture(),
      time = clock();
    emailEnv();
    try {
      const request = {
        ...f,
        email: "first@example.test",
        locale: "en" as const,
        consent: true as const,
      };
      await registerGuestContact(db, request, time, secret);
      const send = vi.fn().mockResolvedValue({ messageId: "verify" });
      await dispatchGuestEmailPings(db, time, send);
      const cap = new URL(
        send.mock.calls[0]?.[0].text.match(/https:\/\/\S+/)[0],
      ).searchParams.get("capability")!;
      time.advance(86_400_001);
      expect(await inspectGuestVerification(db, cap, time, secret)).toBeNull();
      time.set(new Date("2026-09-10T10:00:00Z"));
      await registerGuestContact(
        db,
        { ...request, email: "second@example.test" },
        time,
        secret,
      );
      expect(await verifyGuestContact(db, cap, time, secret)).toBeNull();
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });

  it("verifies an account-free contact on POST, never GET, and revokes return access on optout", async () => {
    const f = await fixture();
    const time = clock();
    emailEnv();
    try {
      expect(
        await registerGuestContact(
          db,
          { ...f, email: "Guest@example.test", locale: "en", consent: true },
          time,
          secret,
        ),
      ).toMatchObject({ status: "unverified" });
      const calls: string[] = [];
      const delivered = await dispatchGuestEmailPings(
        db,
        time,
        async (message) => {
          calls.push(message.text);
          return { messageId: "verify-1" };
        },
      );
      expect(delivered.sent).toBe(1);
      expect(calls[0]).not.toContain("Private Family");
      const cap = new URL(
        calls[0]!.match(/https:\/\/\S+/)![0],
      ).searchParams.get("capability")!;
      expect(await inspectGuestVerification(db, cap, time, secret)).toEqual({
        locale: "en",
      });
      expect((await loadGuestContact(db, f, time)).status).toBe("unverified");
      const access = await verifyGuestContact(db, cap, time, secret);
      expect(access).not.toBeNull();
      expect(await verifyGuestContact(db, cap, time, secret)).toBeNull();
      expect(
        await resolveGuestReturnCapability(
          db,
          access!.capability,
          time,
          secret,
        ),
      ).toMatchObject({ invitationId: f.invitationId });
      await disableGuestContact(db, f, time);
      expect(
        await resolveGuestReturnCapability(
          db,
          access!.capability,
          time,
          secret,
        ),
      ).toBeNull();
      expect((await loadGuestContact(db, f, time)).status).toBe("disabled");
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });
  it("never queues or sends guest email in a synthetic home", async () => {
    const f = await fixture(true);
    const time = clock();
    emailEnv();
    try {
      expect(
        (
          await registerGuestContact(
            db,
            { ...f, email: "guest@example.test", locale: "en", consent: true },
            time,
            secret,
          )
        ).status,
      ).toBe("demo");
      const send = vi.fn().mockResolvedValue({ messageId: "must-not-send" });
      await dispatchGuestEmailPings(db, time, send);
      expect(send).not.toHaveBeenCalled();
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });
  it("rejects wrong-party enrollment and bounds verification sends per invitation", async () => {
    const f = await fixture();
    const time = clock();
    try {
      await expect(
        registerGuestContact(
          db,
          {
            ...f,
            partyId: randomUUID(),
            email: "guest@example.test",
            locale: "en",
            consent: true,
          },
          time,
          secret,
        ),
      ).rejects.toMatchObject({ code: "unavailable" });
      for (let count = 0; count < 3; count++) {
        if (count === 1) time.advance(23 * 60 * 60_000);
        if (count === 2) time.advance(60_000);
        await registerGuestContact(
          db,
          { ...f, email: "guest@example.test", locale: "en", consent: true },
          time,
          secret,
        );
      }
      time.advance(60 * 60_000);
      await expect(
        registerGuestContact(
          db,
          { ...f, email: "guest@example.test", locale: "en", consent: true },
          time,
          secret,
        ),
      ).rejects.toMatchObject({ code: "rate_limit" });
    } finally {
      await db`delete from public.homes where id=${f.homeId}`;
    }
  });
});
