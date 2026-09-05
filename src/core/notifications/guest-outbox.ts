import { randomUUID } from "node:crypto";
import { sqlClient, type DatabaseClient } from "../db/client";
import { SystemClock, type Clock } from "../clock";
import { parseServerEnvironment } from "@/lib/server/env";
import { sesSend, type EmailSender } from "./ses-client";
import {
  loadLiveGuestContact,
  mintGuestCapability,
  type GuestContactRow,
  type GuestSql,
} from "./guest-contact";

const LEASE_MS = 5 * 60_000;
interface OutboxRow {
  id: string;
  home_id: string;
  contact_id: string;
  generation: number;
  kind: "verification" | "reconfirm_chase";
  source_id: string;
  claim_token: string;
  attempts: number;
  created_at: Date;
}
export interface GuestDispatchResult {
  sent: number;
  skipped: number;
  failed: number;
}
export type GuestDeliveryStatus =
  | "no_contact"
  | "unverified"
  | "disabled"
  | "ready"
  | "queued"
  | "sent"
  | "failed"
  | "demo"
  | "unknown"
  | "unavailable_access";
export interface GuestDeliveryFact {
  visitId: string;
  status: GuestDeliveryStatus;
  sentAt: string | null;
}

/** Creates delivery work from authoritative in-app notifications, never model recipients. */
async function enqueueReminders(sql: GuestSql, now: Date) {
  await sql`
    insert into public.guest_email_outbox(home_id,contact_id,generation,kind,source_id,available_at,created_at)
    select contact.home_id,contact.id,contact.generation,'reconfirm_chase',notification.id,${now.toISOString()},${now.toISOString()}
    from public.notifications notification
    join public.visits visit on visit.id=notification.visit_id and visit.home_id=notification.home_id
    join public.scheduled_jobs job on job.id=notification.scheduled_job_id and job.home_id=notification.home_id and job.visit_id=visit.id
    join public.guest_contacts contact on contact.invitation_id=visit.invitation_id and contact.home_id=visit.home_id and contact.party_id=visit.party_id
    join public.invitations invitation on invitation.id=contact.invitation_id and invitation.party_id=contact.party_id and invitation.home_id=contact.home_id
    join public.homes home on home.id=contact.home_id
    where notification.kind='reconfirm_chase' and notification.recipient_kind='party' and notification.recipient_id=contact.party_id
      and not home.demo and contact.consent and contact.verified_at is not null
      and invitation.status<>'cancelled' and invitation.link_token_revoked_at is null
      and invitation.link_token_expires_at>${now.toISOString()}
      and lower(visit.stay) > (${now.toISOString()}::timestamptz at time zone home.timezone)::date
      and visit.status in ('reconfirm_pending','escalated')
      and notification.created_at>=visit.reconfirm_requested_at
      and job.kind='reconfirm_chase' and job.status in ('running','done') and job.due_at<=${now.toISOString()}
    on conflict(kind,source_id,contact_id,generation) do nothing
  `;
}
async function currentRecipient(
  sql: GuestSql,
  ping: OutboxRow,
  now: Date,
): Promise<GuestContactRow | null> {
  const contact = await loadLiveGuestContact(sql, ping.contact_id, now);
  if (
    !contact ||
    contact.demo ||
    !contact.consent ||
    contact.generation !== ping.generation
  )
    return null;
  if (ping.kind === "verification")
    return !contact.verified_at &&
      new Date(contact.requested_at).getTime() + 86_400_000 > now.getTime()
      ? contact
      : null;
  if (!contact.verified_at) return null;
  const [source] = await sql<{ id: string }[]>`
    select notification.id from public.notifications notification
    join public.visits visit on visit.id=notification.visit_id and visit.home_id=notification.home_id
    join public.homes home on home.id=visit.home_id
    join public.scheduled_jobs job on job.id=notification.scheduled_job_id and job.home_id=notification.home_id and job.visit_id=visit.id
    where notification.id=${ping.source_id} and notification.home_id=${contact.home_id}
      and notification.kind='reconfirm_chase' and notification.recipient_kind='party' and notification.recipient_id=${contact.party_id}
      and visit.invitation_id=${contact.invitation_id} and visit.party_id=${contact.party_id}
      and lower(visit.stay) > (${now.toISOString()}::timestamptz at time zone home.timezone)::date
      and visit.status in ('reconfirm_pending','escalated') and notification.created_at>=visit.reconfirm_requested_at
      and job.kind='reconfirm_chase' and job.status in ('running','done') and job.due_at<=${now.toISOString()}
  `;
  return source ? contact : null;
}
export function renderGuestEmail(
  kind: OutboxRow["kind"],
  locale: "en" | "es",
  link: string,
) {
  const verification = kind === "verification";
  const subject =
    locale === "es"
      ? verification
        ? "Verifica tu correo para L’Ayalga"
        : "¿Seguís viniendo a L’Ayalga?"
      : verification
        ? "Verify your email for L’Ayalga"
        : "Still coming to L’Ayalga?";
  const message =
    locale === "es"
      ? verification
        ? "Has solicitado recordatorios por correo. Abre este enlace y confirma tu dirección. Si no lo has solicitado, ignora este correo."
        : "Confirma si seguís viniendo. Abre tu visita para reconfirmar o solicitar un cambio. Puedes desactivar los recordatorios desde tu visita."
      : verification
        ? "You requested email reminders. Open this link and confirm your address. If you did not request this, ignore this email."
        : "Please confirm whether you are still coming. Open your visit to reconfirm or request a change. You can turn reminders off from your visit.";
  const text = `${message}\n\n${link}`;
  const escaped = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!,
    );
  return {
    subject,
    text,
    html: `<p>${escaped(message)}</p><p><a href="${escaped(link)}">${locale === "es" ? "Abrir" : "Open"}</a></p>`,
  };
}
export async function dispatchGuestEmailPings(
  database: DatabaseClient,
  clock: Clock,
  send: EmailSender = sesSend,
): Promise<GuestDispatchResult> {
  const config = parseServerEnvironment();
  const result = { sent: 0, skipped: 0, failed: 0 };
  if (config.email !== "ses" || !config.sesFromAddress) return result;
  const sql = sqlClient(database);
  await enqueueReminders(sql, clock.now());
  await sql`
    with accepted as (
      select distinct on(attempt.outbox_id) attempt.outbox_id,attempt.message_id,attempt.accepted_at
      from public.guest_email_outbox active
      join public.guest_email_attempts attempt on attempt.outbox_id=active.id
      where active.status in ('queued','sending','failed') and attempt.status='accepted'
      order by attempt.outbox_id,attempt.accepted_at desc
    )
    update public.guest_email_outbox outbox
    set status='sent',message_id=accepted.message_id,sent_at=accepted.accepted_at,
      error_name=null,claim_token=null,lease_until=null
    from accepted where outbox.id=accepted.outbox_id and outbox.status in ('queued','sending','failed')
  `;
  await sql`update public.guest_email_attempts set status='unknown' where status='authorized' and authorized_at<=${new Date(clock.now().getTime() - LEASE_MS).toISOString()}`;
  await sql`
    update public.guest_email_outbox outbox
    set status='failed',error_name='UnknownDelivery',claim_token=null,lease_until=null
    where outbox.status='sending' and outbox.lease_until<=${clock.now().toISOString()}
      and exists(select 1 from public.guest_email_attempts attempt
        where attempt.claim_token=outbox.claim_token and attempt.status in ('authorized','unknown'))
  `;
  // A crashed claim with no authorization receipt never crossed the send
  // boundary. It can be retried; exhausted preauthorization claims are failed.
  await sql`update public.guest_email_outbox set status='failed',error_name='DeliveryAttemptsExhausted',claim_token=null,lease_until=null where status='sending' and attempts>=3 and lease_until<=${clock.now().toISOString()}`;
  // A bounded dispatch prevents one tick monopolizing the queue.
  for (let count = 0; count < 25; count++) {
    const now = clock.now(),
      token = randomUUID();
    const [ping] = await sql<OutboxRow[]>`
      with candidate as (
        select id from public.guest_email_outbox
        where attempts<3 and available_at<=${now.toISOString()}
          and error_name is distinct from 'UnknownDelivery'
          and not exists (
            select 1 from public.guest_email_attempts attempt
            where attempt.outbox_id=guest_email_outbox.id
              and (attempt.status='accepted' or
                (attempt.claim_token=guest_email_outbox.claim_token
                  and attempt.status in ('authorized','unknown')))
          )
          and (status in ('queued','failed') or (status='sending' and lease_until<=${now.toISOString()}))
        order by available_at,created_at,id limit 1 for update skip locked
      )
      update public.guest_email_outbox ping set status='sending',attempts=attempts+1,
        claim_token=${token},lease_until=${new Date(now.getTime() + LEASE_MS).toISOString()},error_name=null
      from candidate where ping.id=candidate.id returning ping.*
    `;
    if (!ping) break;
    let acceptedMessageId: string | null = null;
    try {
      const contact = await sql.begin(async (transaction) => {
        // The same home lock orders final send authorization against booking,
        // withdrawal, and contact changes. The network request starts after
        // committing this boundary; later optout cannot undo an in-flight send.
        await transaction`select pg_advisory_xact_lock(hashtextextended(${ping.home_id}::text,0))`;
        await transaction`select id from public.guest_contacts where id=${ping.contact_id} for update`;
        const [owned] = await transaction<
          { id: string }[]
        >`select id from public.guest_email_outbox where id=${ping.id} and claim_token=${token} and status='sending' and lease_until>${clock.now().toISOString()} for update`;
        if (!owned) return null;
        const current = await currentRecipient(transaction, ping, clock.now());
        if (!current) return null;
        await transaction`insert into public.guest_email_attempts(claim_token,outbox_id,home_id,status,authorized_at) values(${token},${ping.id},${ping.home_id},'authorized',${clock.now().toISOString()})`;
        return current;
      });
      if (!contact) {
        await sql`update public.guest_email_outbox set status='cancelled',claim_token=null,lease_until=null,error_name='ObsoleteNotification' where id=${ping.id} and claim_token=${token}`;
        result.skipped++;
        continue;
      }
      const capability = mintGuestCapability(
        contact,
        ping.kind === "verification" ? "verify" : "return",
        ping.kind === "verification"
          ? new Date(contact.requested_at)
          : clock.now(),
      );
      const route = ping.kind === "verification" ? "verify" : "return";
      const link = `${config.appUrl.replace(/\/$/, "")}/${contact.locale}/guest/${route}?capability=${encodeURIComponent(capability)}`;
      const rendered = renderGuestEmail(ping.kind, contact.locale, link);
      const sent = await send({
        fromAddress: config.sesFromAddress,
        toAddress: contact.email,
        ...rendered,
      });
      acceptedMessageId = sent.messageId;
      await sql.begin(async (transaction) => {
        await transaction`update public.guest_email_attempts set status='accepted',accepted_at=${clock.now().toISOString()},message_id=${sent.messageId} where claim_token=${token}`;
        await transaction`update public.guest_email_outbox set status='sent',sent_at=${clock.now().toISOString()},message_id=${sent.messageId},claim_token=null,lease_until=null where id=${ping.id} and claim_token=${token} and status='sending'`;
      });
      result.sent++;
    } catch {
      if (acceptedMessageId) {
        // Provider acceptance is known even when its first persistence failed.
        // Never describe it as a rejected email or automatically send it again.
        await sql`update public.guest_email_attempts set status='accepted',accepted_at=${clock.now().toISOString()},message_id=${acceptedMessageId} where claim_token=${token}`;
        await sql`update public.guest_email_outbox set status='sent',sent_at=${clock.now().toISOString()},message_id=${acceptedMessageId},claim_token=null,lease_until=null where id=${ping.id} and claim_token=${token} and status='sending'`;
        result.sent++;
        continue;
      }
      await sql`update public.guest_email_attempts set status='failed' where claim_token=${token} and status='authorized'`;
      await sql`update public.guest_email_outbox set status='failed',error_name='EmailSendFailed',claim_token=null,lease_until=null,available_at=${new Date(clock.now().getTime() + LEASE_MS * ping.attempts).toISOString()} where id=${ping.id} and claim_token=${token} and status='sending'`;
      console.error("[GUEST_EMAIL_FAILED]", { id: ping.id });
      result.failed++;
    }
  }
  return result;
}
export async function dispatchGuestEmailPingsSafely(
  database: DatabaseClient,
  clock: Clock,
  send: EmailSender = sesSend,
): Promise<GuestDispatchResult | null> {
  try {
    return await dispatchGuestEmailPings(database, clock, send);
  } catch {
    console.error("[GUEST_EMAIL_DISPATCH_FAILED]");
    return null;
  }
}
export async function loadGuestDeliveryFacts(
  database: DatabaseClient,
  homeId: string,
  clock: Clock = new SystemClock(),
): Promise<GuestDeliveryFact[]> {
  const rows = await sqlClient(database)<
    { visit_id: string; status: GuestDeliveryStatus; sent_at: Date | null }[]
  >`
    select visit.id as visit_id,
      case when home.demo then 'demo'
        when invitation.status='cancelled' or invitation.link_token_revoked_at is not null or invitation.link_token is null or invitation.link_token_expires_at<=${clock.now().toISOString()} then 'unavailable_access'
        when contact.id is null then 'no_contact'
        when not contact.consent then 'disabled'
        when contact.verified_at is null then 'unverified'
        when ping.status='sent' then 'sent'
        when ping.error_name='UnknownDelivery' then 'unknown'
        when ping.status='failed' then 'failed'
        when ping.status in ('queued','sending') then 'queued'
        else 'ready' end as status,ping.sent_at
    from public.visits visit join public.homes home on home.id=visit.home_id
    left join public.invitations invitation on invitation.id=visit.invitation_id
    left join public.guest_contacts contact on contact.invitation_id=visit.invitation_id and contact.home_id=visit.home_id and contact.party_id=visit.party_id
    left join lateral (
      select outbox.status,outbox.sent_at,outbox.error_name from public.guest_email_outbox outbox
      join public.notifications notification on notification.id=outbox.source_id and notification.visit_id=visit.id
      where outbox.contact_id=contact.id and outbox.generation=contact.generation and outbox.kind='reconfirm_chase'
        and notification.created_at>=visit.reconfirm_requested_at
        and lower(visit.stay) > (${clock.now().toISOString()}::timestamptz at time zone home.timezone)::date
      and visit.status in ('reconfirm_pending','escalated')
      order by outbox.created_at desc,outbox.id desc limit 1
    ) ping on true
    where visit.home_id=${homeId} and visit.status<>'cancelled'
    order by lower(visit.stay),visit.id
  `;
  return rows.map((row) => ({
    visitId: row.visit_id,
    status: row.status,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
  }));
}
