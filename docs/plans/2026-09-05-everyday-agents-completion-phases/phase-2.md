# Phase 2: Decision inputs and household policy

Plan: `2026-09-05-everyday-agents-completion`. Depends on phase 1.

- [ ] Add bounded informational notes separately from explicit requests in forms, validation, task schema, authority and persisted/resumed state.
- [ ] Keep captured requests immutable to model manipulation; preserve guest information without escalating harmless notes.
- [ ] Show informational notes in authorized guest/host visit details and apply the existing terminal-visit retention policy to the new field.
- [ ] Add host-only validated pets/child-family settings, policy version, audit and common booking advisory lock.
- [ ] Pending booking tools re-evaluate new settings; no guest/agent policy mutation or per-visit override.
- [ ] Update English/Spanish labels and clear policy/decision explanations.
- [ ] Tests prove thank-you -> ordinary booking, accommodation -> interrupt, resume integrity, scoped settings, policy races and changed pending verdict.
- [ ] Compliance/quality reviews and sequential local verification complete.

Pseudocode: trusted_requests := captured_requests + explicit_guest_requests; informational_notes := bounded_text; policy := validated_host_form; lock(home); compare expected version; update/version/audit; commit. Capacity stays a room fact.
