# Phase 1: Cancellation and invitation access

Plan: `2026-09-05-everyday-agents-completion`. Depends on phase 0.

- [ ] Add authorized guest and host cancellation services/actions and explicit review-confirm UI.
- [ ] Provide invitation-scoped withdrawal before a visit exists, retiring queued work and pending decisions; stale approval must not create a visit after withdrawal.
- [ ] Natural-language cancellation leads to confirmation, never accidental reschedule or direct model cancellation.
- [ ] Cancellation atomically releases rooms, cancels all outstanding reminder jobs, retires pending decisions linked through visit or invitation session, and audits actor/outcome.
- [ ] Historical escalation email candidates and queued/resumed work cannot act on cancelled visits.
- [ ] Confirmation/reschedule/reissue extend nonrevoked invitation expiry through checkout+7 days; backfill existing upcoming stays.
- [ ] Tests cover cross-tenant calls, repeats/races, stale resume, calendar tombstones, long-lead stays, revoked and cancelled access.
- [ ] Compliance/quality reviews and sequential local verification complete.

Pseudocode: authorize(actor, home, invitation, visit); home_advisory_lock; reload; if cancelled return; cancel jobs+decisions; delete occupancy; mark cancelled; audit; commit. For access: expires := max(existing_expiry, checkout_UTC+7d), only for eligible nonrevoked invitations.

Primary evidence: booking integration/concurrency tests, token+session guest action tests, host authorization tests, cancellation UI/browser scenario, invitation lifecycle regression.
