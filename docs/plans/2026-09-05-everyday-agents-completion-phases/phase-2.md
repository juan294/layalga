# Phase 2: Decision inputs and household policy

Plan: `2026-09-05-everyday-agents-completion`. Depends on phase 1.

- [x] Add bounded informational notes separately from explicit requests in forms, validation, task schema, authority and persisted/resumed state.
- [x] Keep captured requests immutable to model manipulation; preserve guest information without escalating harmless notes.
- [x] Show informational notes in authorized guest/host visit details and apply the existing terminal-visit retention policy to the new field.
- [x] Add host-only validated pets/child-family settings, policy version, audit and common booking advisory lock.
- [x] Pending booking tools re-evaluate new settings; no guest/agent policy mutation or per-visit override.
- [x] Update English/Spanish labels and clear policy/decision explanations.
- [x] Tests prove thank-you -> ordinary booking, accommodation -> interrupt, resume integrity, scoped settings, policy races and changed pending verdict.
- [x] Compliance/quality reviews and sequential local verification complete.

Pseudocode: trusted_requests := captured_requests + explicit_guest_requests; informational_notes := bounded_text; policy := validated_host_form; lock(home); compare expected version; update/version/audit; commit. Capacity stays a room fact.

## Verification evidence (2026-09-05)

Independent compliance and quality reviews approved both notes/request separation and policy settings. Review caught and corrected raw notes/arrival leaking through the changed prompt format; the actual assembled conversation now excludes them, while trusted state preserves information and explicit requests. Added real-confirmation, resumed authority, reschedule-preservation and retention regressions. Policy tests prove effective database grants, exact shared advisory locking, optimistic concurrent updates and new-policy denial despite earlier host approval.

Local gates pass: 524 tests across 111 files; 17 desktop/mobile browser tests, including thank-you confirmation with saved information and competing policy forms; typecheck, lint, build, bootstrap; unit coverage 392 tests with statements40.74%, branches39.88%, functions43.12%, lines41.51%; both local migrations; all nine local scripted release probes including the full demo driver. No real email, remote compute or deployment.
