# Everyday Agents completion

Date: 2026-09-05. Baseline: develop bf50416. Status: in progress; implementation authorized by the owner across all phases.

## Objective and authority

Implement the actionable September 5 product-checkup recommendations, track them on GitHub, review and verify locally, merge all code to develop, refresh all current documentation, push, and verify healthy CI. The owner explicitly authorized continuing across RPI phases. Actual video recording/upload and submission are owner tasks. Production deployment, IAM application, real guest email sends, Builder publication and recruitment/interviews are not part of this merge authorization. Prepare all code/configuration/drafts needed for those final human actions.

Research: `docs/research/2026-09-05-everyday-agents-product-checkup.md` and the implementation map below. Branch: `feat/everyday-agents-completion`, off develop. Keep phases sequential because services, forms, messages and schema overlap. No phase is batch-eligible. Within a phase, delegate bounded work with exclusive file ownership; run verification sequentially. One reviewed integration PR closes the implementation issues after all local gates, followed by healthy develop CI. Expected remote compute: one PR validation set and one develop validation set, no previews or production deployments.

## Issue coverage

| Issue | Deliverable | Phase |
| --- | --- | --- |
| #110 | Git deployments allowed only on main | 0 |
| #101 | Explicit guest/host cancellation and safe natural-language routing | 1 |
| #103 | Visit-aligned revocable invitation access | 1 |
| #102 | Informational notes separated from human-decision requests | 2 |
| #107 | Host-owned versioned deterministic policy settings | 2 |
| #100 | Consented, verified guest reminder delivery and return journey | 3 |
| #106 | Actual room recommendations informed by scoped memory | 4 |
| #104 | Repeatable guided demo, semantic clock advances and dates | 5 |
| #105 | Decision-first host page, plain outcomes, easier secure handoff | 5 |
| #108 | Measured synthetic coordination evidence and user-study protocol | 6 |
| #109 | All current docs, diagrams, journey guides and submission drafts | 6 |

Deferred as in the accepted assessment: per-night room packing, remote OAuth MCP, WhatsApp/Twilio, two-way calendars and room photography. These were explicitly recommended to remain deferred, not proposed implementation work.

## Implementation map

This is the baseline map recorded before implementation; current behavior is described by the completed phase evidence and current guides.

- `src/core/booking/holds.ts:327`: existing cancellation releases rooms/jobs and updates calendar, but lacks caller scope, audit and pending-decision retirement.
- `src/core/booking/guest-actions.ts:197`: changes currently enqueue rescheduling; token and demo/account actions resolve their own trusted authority.
- `src/agent/run-task.ts:1080`: notes become trusted special requests, including across resumed runs.
- `src/core/booking/invitations.ts:63`: 30-day HMAC link lifetime; `:228` verifies revocation/cancellation/real-time expiry.
- `src/core/notifications/email-outbox.ts:60`: web-only host delivery; `infra/iam/web-ses-policy.json:13` restricts deployed recipient addresses.
- `src/core/reconfirmation/state-machine.ts:48`: escalation starts 24 hours after chase; `src/app/api/ticks/route.ts:18` owns scheduler/outbox orchestration.
- `src/core/rooms/recommendation.ts:31`: rank has no preference input; actual guest search is `src/core/booking/guest-actions.ts:77`, independently of agent room tools.
- `src/core/memory/client.ts:43`: injectable memory-record listing; guest scope has trusted party/home identifiers.
- `src/core/booking/holds.ts:553`: booking uses per-home advisory transaction lock; settings mutations must use the same lock.
- `src/app/[locale]/(host)/page.tsx:398`: room administration precedes decisions/capture; `src/components/host/demo-clock-panel.tsx:109` hardcodes clock dates.

## Product decisions

1. **Cancellation is human-confirmed.** Guest and host can preview the exact visit and confirm cancellation. Before a visit exists, an invitation-scoped withdrawal cancels the request and retires its queued work and pending decisions; a stale approved decision cannot create a visit afterward. Natural-language cancellation prepares that outcome and must never invoke reschedule or cancel without explicit confirmation. Existing transaction is extended with trusted scope, audit and invalidation; queued/resumed work rechecks cancelled state. Repeated confirmation is idempotent. No speculative model authorization.
2. **Access covers booked stays.** Preserve the 30-day unbooked lifetime and extend a nonrevoked invitation through at least checkout plus seven days on confirmation/reschedule, using finite SQL timestamps and a migration for existing upcoming visits. Reissue uses the same horizon; shortening a stay need not invalidate a previously issued valid link. Cancellation/revocation remains authoritative; no expiry bypass for ordinary bearer access.
3. **Information and decisions have separate inputs.** Preserve captured explicit requests and add an explicit guest request field. Informational notes are bounded and retained as information, not automatically appended to approval requests. Show them to the same guest and authorized hosts in visit details, and scrub them under the existing terminal-visit information retention policy. Neither memory nor the model can erase trusted requests; resumed authority restores the exact persisted values. Clearly label both fields in English/Spanish.
4. **Hosts configure existing policy, not override visits.** Expose pets-together and maximum overlapping families with children with validated bounds and a reviewable form; capacity remains verified room inventory. Store a version and audit each change, serialize with booking, and recheck pending approvals against current rules. Existing confirmed stays remain intact. No model/guest settings write permission.
5. **Deliver only to verified, consenting guests.** Use existing SES, web-runtime-only tables and sender. For Google-claimed guests, derive the verified address server-side. Account-free guests need a contact-verification journey before reminders can send. Verification/return links are scoped, expiring and revocable; GET never confirms a stay or opts anyone in. Demo homes never send guest emails. Address/contact data never enters agent prompts/memory.
6. **Keep delivery facts distinct from silence.** Guest outbox uses unique source/recipient, claim tokens, bounded retry and current-state/consent checks; cancellation/reschedule suppress obsolete reminders. Hosts see delivery failure/unavailable contact separately from no reply. Reconfirmation timing must not falsely imply an email was delivered. Persist delivery evidence, not fabricated success.
7. **Memory changes a recommendation, not policy.** Retrieve only the current party namespace. Map bounded supported room preferences to verified guest-safe room facts; do not equate ground floor with wheelchair accessibility. Rank only feasible choices, explain matched/unavailable preferences and keep guest choice. Missing memory falls back visibly and safely. Use an injectable real-memory client for local tests, never claim synthetic test records as actual production memory.
8. **A guided demo remains real execution.** Give an explicit scenario and next step, routine success first, exceptions second. Derive clock steps from persisted scheduled jobs/visit dates and guard repeated presses/absence of visits. Keep synthetic labeling and no real guest sends. Relative defaults derive from the household clock; no expired fixed private links in advertised judging paths.
9. **Outcome evidence is accurately labeled.** Execute a local synthetic scenario and export actual durations/actions/decisions/delivery outcomes. Distinguish automation wall time from human effort; no human savings claim without a measured baseline. Provide a small participant protocol for the owner to run later.

## Phases and completion evidence

- [x] Phase 0: issue tracking, plan review and no-preview configuration.
- [x] Phase 1: cancellation and access lifecycle.
- [x] Phase 2: decision semantics and policy settings.
- [x] Phase 3: consented guest reminder delivery.
- [x] Phase 4: memory-informed recommendations.
- [x] Phase 5: host and guided-demo experience.
- [ ] Phase 6: outcome evidence, comprehensive docs, integration PR and healthy CI.

For each phase: regression-first where behavior changes; implementation -> independent compliance review -> corrections -> dedicated reuse/quality/efficiency review -> sequential local checks. Record deviations in the companion notes document only when needed. Update phase checkboxes only from actual evidence. Required local checks: bootstrap, typecheck, lint, unit/coverage, database integration, build, browser tests, demo driver and release probes on local scripted runtime. Database migrations are tested against local Supabase; no remote db push. Full suites run centrally, not from concurrent agents. Later changes invalidate affected earlier results and require rerunning appropriate gates before the final push.

## Final completion audit

All issue acceptance criteria must map to current code, regression tests and reviewed documentation. Inspect PR merge into develop, exact develop SHA and all required check conclusions; do not infer success from exit status or stale runs. Confirm no preview was created by our pushes. Confirm clean local workspace with authored work committed and origin/develop current. Close implementation issues only after their acceptance evidence and merge are present. Record human-only pending tasks without misrepresenting them as implemented production behavior.
