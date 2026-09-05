# Phase 3: Guest delivery and consent

Plan: `2026-09-05-everyday-agents-completion`. Depends on phase 2.

- [x] Web-only contact/consent, verification and guest-outbox schema with RLS/explicit least-privilege grants and retention.
- [x] Verified Google address path and account-free contact verification, explicit opt-in/withdrawal, bilingual guest controls.
- [x] Separate expiring/revocable guest return capability without rotating the original guest link; GET is read-only.
- [x] SES reuse with synthetic-home guard; no contact data in agent payload/memory.
- [x] Source-bound claims, retries, consent/current-visit recheck, cancellation/reschedule suppression and failure state.
- [x] Integrate tick dispatch and distinguish unavailable/failed delivery from guest silence in host outcomes.
- [x] Prepare IAM artifact and production application checklist; do not apply or send real email.
- [x] Test verification replay/expiry, recipient scope, opt-out, concurrent claims, failure retry, stale/cancelled source, no demo sends, grants and rendering.
- [x] Compliance/quality reviews and sequential local verification complete.

Pseudocode: enroll verified_contact after explicit_consent; notification -> unique outbox; claim(token, deadline); reload consent/source/current visit; send via web SES; acknowledge only matching claim; retry bounded failures. Return capability binds contact+invitation+generation+expiry and resolves trusted authority only after verification.

## Verification evidence (2026-09-05)

Independent compliance and quality reviews approved contact/authority, source-bound dispatch, receipt recovery and guest/host integration. Review fixes include cancellation/consent ordering at final authorization, unknown outcomes after a worker disappears, atomic receipt fences against post-sweep lease races, prearrival suppression, sign-out cookie cleanup, reused account read authority, same-origin guest returns, and an actual reload after a competing policy edit.

Local gates pass: 572 tests across119 files; unit coverage422 tests with statements41.85%, branches41.45%, functions43.41%, lines42.65%; 19 desktop/mobile browser journeys; typecheck, lint, production build and bootstrap. A clean local Supabase reset applied every migration through20260905000700. Guest email tests use injected senders; browser tests exercise actual local verification, reconfirmation, cancellation and opt-out without external sends. IAM remains a prepared artifact, not applied.

All nine local scripted release probes passed, including the full demo driver. The production build was verified separately; local HTTP probes ran in development mode because production readiness correctly requires HTTPS. No remote compute, real email or deployment was triggered.
