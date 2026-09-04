# Phase 2: Host email pings through Amazon SES

Depends on: Phase 0 (cron path on production), AWS profile, DNS access for `thecreativetoken.com`.
Branch: `feat/host-email-pings`.

## Goal

When a run pauses for a host decision, and when a reconfirmation escalates, each consenting host receives one email with a deep link. Guests never receive email. Sending is idempotent, host-only by IAM, and switchable per host in the UI.

## Design

- **Outbox, not inline sends.** The agent runtime cannot read `host_identity_claims` and should not hold SES rights. A web-runtime function `dispatchHostEmailPings(db, clock)` selects unsent work and sends. It runs from `/api/ticks` (every minute), from `/api/demo/clock` after due jobs, and from the host page through `after()` so a host who opens the app also flushes the outbox.
- **Two ping kinds.** `pending_decision` (source `pending_decisions` rows with `status = 'pending'`) and `reconfirm_escalation` (source `notifications` rows with `kind = 'reconfirm_escalation'`, `recipient_kind = 'host'`).
- **Idempotency.** New table `public.host_email_pings (id, home_id, host_id, kind, source_id uuid, to_address, subject, status 'sending'|'sent'|'failed', message_id, error_name, created_at, sent_at, unique (kind, source_id, host_id))`. Insert with `on conflict do nothing returning id`; only the row winner sends; failure marks `failed` and a later run retries by resetting rows older than five minutes. Mirrors `notifications_reconfirmation_delivery_idx`.
- **Consent.** New table `public.host_notification_settings (host_id uuid primary key, home_id uuid not null, email_pings boolean not null default true, updated_at)`, composite FK to `hosts (id, home_id)`, grants `select, insert, update` to `layalga_web_runtime`, RLS mirroring `hosts`. Absent row means enabled.
- **Recipient address.** `host_identity_claims.normalized_email` joined on `host_id`; skip hosts without a claim.
- **Content.** Subject and body chosen by `hosts.locale` from the bilingual notification bodies; a pending-decision email includes the party name, stay dates, reason label, and the link `${APP_URL}/${locale}#pending-decisions`. Plain text plus a minimal HTML body. No guest tokens or calendar URLs.
- **IAM.** `layalga-web` user gets `ses:SendEmail` on the domain identity with `ses:FromAddress = noreply@layalga.thecreativetoken.com` and `ForAllValues:StringEquals ses:Recipients` pinned to the two host addresses (`infra/iam/web-ses-policy.json`). Deny-test with a third address.
- **Identity.** `aws sesv2 create-email-identity --email-identity thecreativetoken.com`; publish the three DKIM CNAMEs at the DNS host; verify both host addresses as sandbox recipients (each clicks one confirmation link). Fallback sender until DKIM verifies: `juan294@gmail.com` as a verified address identity.
- **Env.** `EMAIL=none|ses` (non-production default `none`), `SES_FROM_ADDRESS`, `SES_REGION` defaults to `AWS_REGION`. Both `parseServerEnvironment` and `serverEnvironmentReadiness` updated; `EMAIL=ses` requires `SES_FROM_ADDRESS`.

## Tasks

- [x] 2.1 Migration `20260904000100_host_email_pings.sql`: both tables, indexes, grants, RLS, Drizzle schema in `src/core/db/schema.ts`.
- [x] 2.2 Dependency `@aws-sdk/client-sesv2` pinned `3.1121.0`; `src/core/notifications/ses-client.ts` with an injectable `send` for tests.
- [x] 2.3 `src/core/notifications/email-outbox.ts`: `selectPendingPings`, `dispatchHostEmailPings`, `renderPing(kind, locale, context)`.
- [x] 2.4 Wire: `/api/ticks` after the queue drain; `/api/demo/clock` after `runDueJobs`; host page `after(() => dispatchHostEmailPings(...))`.
- [x] 2.5 Consent UI: a `panelStyle` section "Email pings" on the host page with a toggle form and the masked address (`j***@gmail.com`); Server Action `updateEmailPingsAction` in `src/app/[locale]/(host)/actions.ts`; new `ActionErrorCode` `email_settings_update_failed`; i18n keys `Host.emailPings.*`.
- [ ] 2.6 AWS: identity creation, DKIM records, recipient verification, IAM policy, `EMAIL=ses` and `SES_FROM_ADDRESS` in Vercel production; redeploy.
- [x] 2.7 Demo driver: `scripts/demo-e2e.ts` asserts two `sent` ping rows per beat (one per host) after approval and after escalation when `EMAIL=ses`, else zero rows; release probe 6 adds the same count with `--expect-email`.
- [x] 2.8 `docs/security/data-lifecycle.md`: email content, retention of `host_email_pings` (90 days in the retention function), SES sandbox note.

## Pseudocode

```ts
export async function dispatchHostEmailPings(db, clock, send = sesSend) {
  const config = parseServerEnvironment();
  if (config.email !== "ses") return { sent: 0, skipped: 0 };
  const candidates = await sql`
    with decisions as (select d.id as source_id, 'pending_decision' as kind, d.home_id, ...
                       from pending_decisions d where d.status = 'pending' and d.created_at > now() - interval '7 days'),
         escalations as (select n.id, 'reconfirm_escalation', n.home_id, n.recipient_id as host_id, ...
                       from notifications n where n.kind = 'reconfirm_escalation' and n.recipient_kind = 'host')
    select ... from (decisions cross join hosts h on h.home_id = d.home_id union all escalations) s
    join host_identity_claims c on c.host_id = s.host_id
    left join host_notification_settings st on st.host_id = s.host_id
    where coalesce(st.email_pings, true)
      and not exists (select 1 from host_email_pings p where p.kind = s.kind and p.source_id = s.source_id and p.host_id = s.host_id and p.status <> 'failed')`;
  for (const c of candidates) {
    const [row] = await sql`insert into host_email_pings (...) values (...) on conflict do nothing returning id`;
    if (!row) continue;
    try { const { messageId } = await send(renderPing(c)); await sql`update ... set status='sent', message_id=..., sent_at=now()`; }
    catch (e) { await sql`update ... set status='failed', error_name=${name(e)}`; console.error("[EMAIL_PING_FAILED]", { id: row.id, errorName }); }
  }
}
```

## Tests

- `src/core/notifications/email-outbox.integration.test.ts`: one email per host per source; consent off skips; second run sends nothing; failed row retried after five minutes; guest recipients never selected.
- `src/lib/server/env.test.ts`: `EMAIL=ses` without `SES_FROM_ADDRESS` reports `missing`; `EMAIL=none` keeps health `ok`.
- `src/app/[locale]/(host)/actions.test.ts`: consent toggle scoped to the host's own row.
- Manual deny test: send to a third address returns `AccessDenied`.

## Done when

- [ ] Both hosts receive one decision email and one escalation email in the four-beat demo on production.
- [ ] Toggle off stops emails for that host; toggle on resumes.
- [ ] PR open; CI green.
