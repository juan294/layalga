# Phase 3: Guest delivery and consent

Plan: `2026-09-05-everyday-agents-completion`. Depends on phase 2.

- [ ] Web-only contact/consent, verification and guest-outbox schema with RLS/explicit least-privilege grants and retention.
- [ ] Verified Google address path and account-free contact verification, explicit opt-in/withdrawal, bilingual guest controls.
- [ ] Separate expiring/revocable guest return capability without rotating the original guest link; GET is read-only.
- [ ] SES reuse with synthetic-home guard; no contact data in agent payload/memory.
- [ ] Source-bound claims, retries, consent/current-visit recheck, cancellation/reschedule suppression and failure state.
- [ ] Integrate tick dispatch and distinguish unavailable/failed delivery from guest silence in host outcomes.
- [ ] Prepare IAM artifact and production application checklist; do not apply or send real email.
- [ ] Test verification replay/expiry, recipient scope, opt-out, concurrent claims, failure retry, stale/cancelled source, no demo sends, grants and rendering.
- [ ] Compliance/quality reviews and sequential local verification complete.

Pseudocode: enroll verified_contact after explicit_consent; notification -> unique outbox; claim(token, deadline); reload consent/source/current visit; send via web SES; acknowledge only matching claim; retry bounded failures. Return capability binds contact+invitation+generation+expiry and resolves trusted authority only after verification.
