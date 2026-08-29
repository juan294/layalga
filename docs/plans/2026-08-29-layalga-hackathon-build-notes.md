# L'Ayalga hackathon build deviations

Plan: `2026-08-29-layalga-hackathon-build.md`

## Deviations

### Phase 0: AgentCore packaging

- Plan said: bundle all dependencies into one ESM file, with CommonJS as the fallback.
- Found: Strands has an optional S3 import and AgentCore loads Fastify plugins with runtime `require`; neither fully bundled format starts with the pinned packages.
- Chose: bundle local TypeScript with `--packages=external` and vendor hoisted production dependencies in the ZIP.
- Why: this is the AWS-supported Node direct-code package shape and it started successfully in AgentCore.

### Phase 0: Strands session identifiers

- Plan said: use colon-prefixed session identifiers such as `spike:<uuid>`, `inv:<id>`, and `tick:<id>`.
- Found: Strands 1.15.0 rejects identifiers outside `^[a-z0-9_-]+$`.
- Chose: use `spike_<uuid>`, `inv_<id>`, and `tick_<id>`.
- Why: invalid identifiers fail before session persistence or restore runs.

### Phase 0: Runtime verdict

- Plan said: use AgentCore when every interrupt-and-resume assertion passes; otherwise use the local runtime and delete the failed AgentCore runtime.
- Found: AgentCore reached `READY` and started the application, but Bedrock rejected the first Sonnet 4.5 call because Anthropic use-case details were not active for the AWS account; a direct Bedrock CLI call returned the same error.
- Chose: accept the planned `local` verdict and delete runtime `layalga_agent-h3IZEMHONS`; keep the versioned S3 bucket and IAM role for a later retry.
- Why: the account-level model gate prevents the Phase 0 protocol and matches the plan's explicit fallback condition.

### Phase 1: Children-rule test fixture

- Plan said: use a `2 adults + 1 child` draft to isolate `deny(children)` while visit E occupies Teixu and Horreu.
- Found: only Fonte with 2 beds remains free, so the 3-person draft reaches `deny(beds)` before the children rule.
- Chose: use `1 adult + 1 child` in both children-rule rows and keep the 3-adult special-request row as the beds-precedence case.
- Why: the corrected fixture fits the remaining room, isolates `deny(children)`, and preserves the documented beds-first precedence.

### Phase 1 verification

- Local Supabase reset applied all five migrations and the demo seed.
- The remote project `hyyrnpyidipkuhakeiyb` accepted the four Phase 1 migrations and the demo seed. The verified counts were one home, three rooms, two hosts, two parties, and two invitations.
- Sequential checks passed: typecheck, lint, 44 tests, production build, AgentCore bundle scaffold, bootstrap verification, actionlint, and `git diff --check`.
- The concurrency protocol passed its required runs and five extra stress runs after the constraint-only probe normalized PostgreSQL deadlock code `40P01` to `RoomUnavailableError`. Production booking paths still normalize only exclusion code `23P01`.
