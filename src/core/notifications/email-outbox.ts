import { verifiedHostDecisionContext } from "@/agent/host-decision-context";
import type { Clock } from "@/core/clock";
import { sqlClient, type DatabaseClient } from "@/core/db/client";
import type { HostEmailPingKind, HostEmailPingStatus } from "@/core/db/schema";
import { decisionReasonKey } from "@/lib/decision-reasons";
import { objectValue } from "@/lib/json-object";
import { parseServerEnvironment } from "@/lib/server/env";

import { sesSend, type EmailSender } from "./ses-client";

const RETRY_AFTER_MS = 5 * 60 * 1_000;
const OBSOLETE_NOTIFICATION = "ObsoleteNotification";

interface CandidateRow {
  source_id: string;
  kind: HostEmailPingKind;
  home_id: string;
  host_id: string;
  locale: "en" | "es";
  reason: unknown;
  party_name: string;
  to_address: string;
  existing_id: string | null;
  existing_status: HostEmailPingStatus | null;
  existing_created_at: Date | string | null;
}

export interface PendingPingCandidate {
  sourceId: string;
  kind: HostEmailPingKind;
  homeId: string;
  hostId: string;
  locale: "en" | "es";
  partyName: string;
  toAddress: string;
  reasonCode?: string;
  stay?: readonly [string, string];
  existingId: string | null;
  existingStatus: HostEmailPingStatus | null;
  existingCreatedAt: Date | null;
}

export interface DispatchResult {
  sent: number;
  skipped: number;
}

export interface PingContext {
  partyName: string;
  link: string;
  stay?: readonly [string, string];
  reasonCode?: string;
}

export interface RenderedPing {
  subject: string;
  text: string;
  html: string;
}

/**
 * Finds every host who should receive a `pending_decision` or
 * `reconfirm_escalation` email ping, joined to the address consent allows
 * and to any existing `host_email_pings` row so the caller can decide
 * whether to insert, retry, or skip. Guests are never selected: candidates
 * come only from `public.hosts` joined to `public.host_identity_claims`.
 */
export async function selectPendingPings(
  database: DatabaseClient,
  now: Date,
  target?: Pick<PendingPingCandidate, "kind" | "sourceId" | "hostId" | "homeId">,
): Promise<PendingPingCandidate[]> {
  const sql = sqlClient(database);
  // Restrict each source before its joins when revalidating one claimed ping.
  const decisionScope = target
    ? sql`d.id = ${target.sourceId} and d.home_id = ${target.homeId}
        and ${target.kind} = 'pending_decision'`
    : sql`true`;
  const escalationScope = target
    ? sql`notification.id = ${target.sourceId}
        and notification.home_id = ${target.homeId}
        and host.id = ${target.hostId}
        and ${target.kind} = 'reconfirm_escalation'`
    : sql`true`;
  const rows = await sql<CandidateRow[]>`
    with decisions as (
      select
        d.id as source_id,
        d.home_id,
        d.run_id,
        d.visit_id,
        d.reason
      from public.pending_decisions d
      where d.status = 'pending'
        and ${decisionScope}
        and d.created_at > ${now.toISOString()}::timestamptz - interval '7 days'
    ),
    decision_candidates as (
      select
        decisions.source_id,
        'pending_decision'::text as kind,
        decisions.home_id,
        host.id as host_id,
        host.locale,
        decisions.reason,
        coalesce(party.family_name, '') as party_name
      from decisions
      join public.hosts host on host.home_id = decisions.home_id
      left join public.runs run on run.id = decisions.run_id
      left join public.visits visit on visit.id = decisions.visit_id
      left join public.invitations invitation on invitation.id = coalesce(
        visit.invitation_id,
        case
          when run.payload->>'invitationId' ~* '^[0-9a-f-]{36}$'
          then (run.payload->>'invitationId')::uuid
          else null
        end
      )
      left join public.parties party
        on party.id = coalesce(visit.party_id, invitation.party_id)
      where ${target ? sql`host.id = ${target.hostId}` : sql`true`}
        and (visit.id is null or visit.status <> 'cancelled')
        and (invitation.id is null or invitation.status <> 'cancelled')
        and not exists (
          select 1 from public.invitations withdrawn
          where decisions.home_id = withdrawn.home_id
            and withdrawn.status = 'cancelled'
            and run.session_id = 'inv_' || withdrawn.id::text
        )
    ),
    escalation_candidates as (
      select
        notification.id as source_id,
        'reconfirm_escalation'::text as kind,
        notification.home_id,
        host.id as host_id,
        host.locale,
        null::jsonb as reason,
        coalesce(party.family_name, '') as party_name
      from public.notifications notification
      join public.hosts host
        on host.id = notification.recipient_id
       and host.home_id = notification.home_id
      left join public.visits visit on visit.id = notification.visit_id
      left join public.invitations invitation on invitation.id = visit.invitation_id
      left join public.parties party on party.id = visit.party_id
      where notification.kind = 'reconfirm_escalation'
        and ${escalationScope}
        and notification.recipient_kind = 'host'
        and visit.status = 'escalated'
        and (invitation.id is null or invitation.status <> 'cancelled')
    ),
    candidates as (
      select * from decision_candidates
      union all
      select * from escalation_candidates
    )
    select
      candidate.source_id,
      candidate.kind,
      candidate.home_id,
      candidate.host_id,
      candidate.locale,
      candidate.reason,
      candidate.party_name,
      claim.normalized_email as to_address,
      ping.id as existing_id,
      ping.status as existing_status,
      ping.created_at as existing_created_at
    from candidates candidate
    -- A host can have more than one host_identity_claims row (one per
    -- pre-provisioned address); pick a single deterministic address per
    -- host so a candidate never fans out into pings to more than one
    -- address, the same limit-1 convention the host page's own address
    -- lookup uses.
    join public.host_identity_claims claim
      on claim.normalized_email = (
        select claim2.normalized_email
        from public.host_identity_claims claim2
        where claim2.host_id = candidate.host_id
          and claim2.home_id = candidate.home_id
        order by claim2.normalized_email
        limit 1
      )
    left join public.host_notification_settings settings
      on settings.host_id = candidate.host_id
    left join public.host_email_pings ping
      on ping.kind = candidate.kind
     and ping.source_id = candidate.source_id
     and ping.host_id = candidate.host_id
    where coalesce(settings.email_pings, true)
      and ping.error_name is distinct from ${OBSOLETE_NOTIFICATION}
    order by candidate.source_id, candidate.host_id
  `;

  return rows.map((row) => {
    const context =
      row.kind === "pending_decision"
        ? verifiedHostDecisionContext(row.reason)
        : null;
    return {
      sourceId: row.source_id,
      kind: row.kind,
      homeId: row.home_id,
      hostId: row.host_id,
      locale: row.locale,
      partyName: row.party_name,
      toAddress: row.to_address,
      reasonCode: decisionReasonCode(row.reason),
      stay: context?.stay,
      existingId: row.existing_id,
      existingStatus: row.existing_status,
      existingCreatedAt: row.existing_created_at
        ? new Date(row.existing_created_at)
        : null,
    };
  });
}

/**
 * Sends the outstanding host email pings. Only sends when `EMAIL=ses`.
 * Idempotent: a candidate that already has a `sent` row, or a `sending`
 * or `failed` row younger than five minutes, is skipped; an older
 * `sending` or `failed` row is reclaimed for retry.
 */
export async function dispatchHostEmailPings(
  database: DatabaseClient,
  clock: Clock,
  send: EmailSender = sesSend,
): Promise<DispatchResult> {
  const config = parseServerEnvironment();
  if (config.email !== "ses" || !config.sesFromAddress) {
    return { sent: 0, skipped: 0 };
  }
  const fromAddress = config.sesFromAddress;
  const sql = sqlClient(database);
  const now = clock.now();
  const candidates = await selectPendingPings(database, now);

  let sent = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    // A failed send (caught below) counts toward neither total: the row is
    // left `failed` for `reclaimStalePing` to retry on a later dispatch.
    const outcome = await sendCandidatePing(
      sql,
      candidate,
      fromAddress,
      now,
      send,
    );
    if (outcome === "sent") sent += 1;
    else if (outcome === "skipped") skipped += 1;
  }

  return { sent, skipped };
}

/**
 * Renders, claims, sends, and marks one candidate's ping. Split out of
 * `dispatchHostEmailPings` so each step (claim, render, send, mark) reads as
 * its own unit rather than one long loop body.
 */
async function sendCandidatePing(
  sql: ReturnType<typeof sqlClient>,
  candidate: PendingPingCandidate,
  fromAddress: string,
  now: Date,
  send: EmailSender,
): Promise<"sent" | "skipped" | "failed"> {
  const rendered = renderPing(candidate.kind, candidate.locale, {
    partyName: candidate.partyName,
    link: pingLink(candidate.kind, candidate.locale),
    stay: candidate.stay,
    reasonCode: candidate.reasonCode,
  });

  const pingId = candidate.existingId
    ? await reclaimStalePing(sql, candidate, now)
    : await claimNewPing(sql, candidate, rendered.subject, now);

  if (!pingId) return "skipped";

  try {
    const [current] = await selectPendingPings(sql, now, candidate);
    if (!current || current.toAddress !== candidate.toAddress) {
      // Keep the terminal reason without claiming an email was sent. The
      // selector excludes this marker so an obsolete row is never retried.
      await sql`
        update public.host_email_pings
        set status = 'failed', error_name = ${OBSOLETE_NOTIFICATION}
        where id = ${pingId} and status = 'sending'
      `;
      return "skipped";
    }
    const { messageId } = await send({
      fromAddress,
      toAddress: candidate.toAddress,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    await sql`
      update public.host_email_pings
      set status = 'sent', message_id = ${messageId}, sent_at = now()
      where id = ${pingId}
    `;
    return "sent";
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    await sql`
      update public.host_email_pings
      set status = 'failed', error_name = ${errorName}
      where id = ${pingId}
    `;
    console.error("[EMAIL_PING_FAILED]", { id: pingId, errorName });
    return "failed";
  }
}

/**
 * Runs `dispatchHostEmailPings` but never throws: a dispatch failure (a
 * transient SES or database error outside the per-row try/catch) must not
 * fail the request that triggered it. Callers that want the result still
 * get it; callers that only want the side effect (`after()`) can ignore it.
 */
export async function dispatchHostEmailPingsSafely(
  database: DatabaseClient,
  clock: Clock,
  send: EmailSender = sesSend,
): Promise<DispatchResult | null> {
  try {
    return await dispatchHostEmailPings(database, clock, send);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error("[EMAIL_PING_DISPATCH_FAILED]", { errorName });
    return null;
  }
}

async function claimNewPing(
  sql: ReturnType<typeof sqlClient>,
  candidate: PendingPingCandidate,
  subject: string,
  now: Date,
): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.host_email_pings (
      home_id, host_id, kind, source_id, to_address, subject, status,
      created_at
    ) values (
      ${candidate.homeId}, ${candidate.hostId}, ${candidate.kind},
      ${candidate.sourceId}, ${candidate.toAddress}, ${subject}, 'sending',
      ${now.toISOString()}
    )
    on conflict (kind, source_id, host_id) do nothing
    returning id
  `;
  return row?.id ?? null;
}

async function reclaimStalePing(
  sql: ReturnType<typeof sqlClient>,
  candidate: PendingPingCandidate,
  now: Date,
): Promise<string | null> {
  if (
    !candidate.existingId ||
    !candidate.existingStatus ||
    (candidate.existingStatus !== "sending" &&
      candidate.existingStatus !== "failed") ||
    !candidate.existingCreatedAt ||
    now.getTime() - candidate.existingCreatedAt.getTime() < RETRY_AFTER_MS
  ) {
    return null;
  }
  const [row] = await sql<{ id: string }[]>`
    update public.host_email_pings
    set status = 'sending', message_id = null, error_name = null
    where id = ${candidate.existingId}
      and status = ${candidate.existingStatus}
    returning id
  `;
  return row?.id ?? null;
}

function pingLink(kind: HostEmailPingKind, locale: "en" | "es"): string {
  const appUrl = parseServerEnvironment().appUrl.replace(/\/$/, "");
  return kind === "pending_decision"
    ? `${appUrl}/${locale}#pending-decisions`
    : `${appUrl}/${locale}`;
}

// The pending-decision email embeds the reason as a noun phrase mid-sentence
// ("… is requesting {phrase} for {stay}"), so it keeps its own wording
// rather than the dashboard's standalone `Host.decisionReasons.*` sentences.
// `decisionReasonKey` still classifies the code the same way the dashboard
// does, so this only ever adds copy, never a second classification.
const REASON_PHRASES: Record<
  ReturnType<typeof decisionReasonKey>,
  { en: string; es: string }
> = {
  specialRequest: {
    en: "approval for a special request",
    es: "aprobación para una petición especial",
  },
  children: { en: "children in the party", es: "niños en el grupo" },
  pets: { en: "pets", es: "mascotas" },
  beds: { en: "the number of beds", es: "el número de camas" },
  overflow: {
    en: "an overflow arrangement",
    es: "un arreglo de desbordamiento",
  },
  other: { en: "approval for a request", es: "aprobación para una solicitud" },
};

export function renderPing(
  kind: HostEmailPingKind,
  locale: "en" | "es",
  context: PingContext,
): RenderedPing {
  const partyName =
    context.partyName || (locale === "es" ? "Una familia" : "A family");
  if (kind === "reconfirm_escalation") {
    const subject =
      locale === "es"
        ? `Reconfirmación pendiente en L’Ayalga`
        : `Reconfirmation needed at L’Ayalga`;
    const text =
      locale === "es"
        ? `${partyName} no ha reconfirmado su visita. Revísalo ahora: ${context.link}`
        : `${partyName} has not reconfirmed their visit. Review it now: ${context.link}`;
    return { subject, text, html: htmlBody(text, context.link) };
  }

  const reasonLabel =
    REASON_PHRASES[decisionReasonKey(context.reasonCode)][locale];
  const stayText = context.stay
    ? `${context.stay[0]} – ${context.stay[1]}`
    : locale === "es"
      ? "fechas pendientes"
      : "dates pending";
  const subject =
    locale === "es"
      ? `Una decisión te espera en L’Ayalga`
      : `A decision is waiting for you at L’Ayalga`;
  const text =
    locale === "es"
      ? `${partyName} solicita ${reasonLabel} para ${stayText}. Revisa y decide: ${context.link}`
      : `${partyName} is requesting ${reasonLabel} for ${stayText}. Review and decide: ${context.link}`;
  return { subject, text, html: htmlBody(text, context.link) };
}

function htmlBody(text: string, link: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped}</p><p><a href="${link}">${link}</a></p>`;
}

function decisionReasonCode(value: unknown): string | undefined {
  const reason = objectValue(value);
  const code = reason?.reason ?? reason?.decision;
  return typeof code === "string" ? code : undefined;
}
