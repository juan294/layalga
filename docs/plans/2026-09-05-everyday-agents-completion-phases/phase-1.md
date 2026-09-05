# Phase 1: Cancellation and invitation access

Plan: `2026-09-05-everyday-agents-completion`. Depends on phase 0.

- [x] Add authorized guest and host cancellation services/actions and explicit review-confirm UI.
- [x] Provide invitation-scoped withdrawal before a visit exists, retiring queued work and pending decisions; stale approval must not create a visit after withdrawal.
- [x] Natural-language cancellation leads to confirmation, never accidental reschedule or direct model cancellation.
- [x] Cancellation atomically releases rooms, cancels all outstanding reminder jobs, retires pending decisions linked through visit or invitation session, and audits actor/outcome.
- [x] Historical escalation email candidates and queued/resumed work cannot act on cancelled visits.
- [x] Confirmation/reschedule/reissue extend nonrevoked invitation expiry through checkout+7 days; backfill existing upcoming stays.
- [x] Tests cover cross-tenant calls, repeats/races, stale resume, calendar tombstones, long-lead stays, revoked and cancelled access.
- [x] Compliance/quality reviews and sequential local verification complete.

Pseudocode: authorize(actor, home, invitation, visit); home_advisory_lock; reload; if cancelled return; cancel jobs+decisions; delete occupancy; mark cancelled; audit; commit. For access: expires := max(existing_expiry, checkout_UTC+7d), only for eligible nonrevoked invitations.

Primary evidence: booking integration/concurrency tests, token+session guest action tests, host authorization tests, cancellation UI/browser scenario, invitation lifecycle regression.

## Verification evidence (2026-09-05)

Independent compliance and quality review approved cancellation authorization, stale-work races and link lifecycle. Full local Vitest passed 500 tests in 107 files; final account and lifecycle checks passed 22 tests after the account stale-review correction. Desktop and mobile browser checks passed after fixing cancellation tap targets and correcting an unavailable-link assertion. All nine local scripted release probes passed, including the complete demo driver, concurrent conflict, interrupt/resume, reconfirmation and cleanup. Both migrations applied in a clean local Supabase reset. Bootstrap, typecheck, lint and the final production build passed. Unit coverage passed (379 tests; statements 40.81%, branches 40.35%, functions 43.04%, lines 41.58%).

The build after browser testing exposed pre-existing unsupported helper exports from Next route modules. Moved health and tick-authorization helpers into adjacent modules without behavior changes; all nine existing helper tests and the subsequent build pass. No remote compute or deployment was triggered.
