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

### Phase 2: Applied decision state

- Plan said: a resume marks its `pending_decisions` rows `applied`.
- Found: the Phase 1 schema permits only `pending`, `approved`, and `declined`; there is no `applied` state.
- Chose: set the decision to `approved` or `declined` before resume, then write a `decision_applied` audit event with the pending decision ID, consuming run ID, and interrupt ID after Strands consumes the response.
- Why: this preserves the schema contract, separates the host's decision from successful application, and gives each resume attempt traceable evidence.

### Phase 2: Scripted model stream completeness

- Plan said: the scripted tool-use stream starts with a content block, and the text stream omits a content-block stop.
- Found: Strands 1.15.0 rejects a tool-use stream without `modelMessageStartEvent` and does not add text to the final message without `modelContentBlockStopEvent`.
- Chose: emit the required message start for tool use and the required content-block stop for text.
- Why: these are the minimum additional SDK events needed for the planned deterministic streams to produce valid messages.

### Phase 2: Bedrock smoke

- Attempted on 2026-08-29 with AWS profile `archy`, region `us-east-1`, and model `us.anthropic.claude-sonnet-4-5-20250929-v1:0`.
- Result: failed before the model could call `capture_invitation`. Bedrock returned HTTP 404 `ResourceNotFoundException`: `Model use case details have not been submitted for this account. Fill out the Anthropic use case details form before using the model. If you have already filled out the form, try again in 15 minutes.`
- No structured invitation was produced. This is the same account-level Anthropic gate recorded in Phase 0; the local scripted-model path remains the selected fallback.

### Phase 2: Strands optional S3 dependency

- Plan said: install the packages pinned in section 6.
- Found: the Next.js production build statically resolves Strands' optional context-offloader import of `@aws-sdk/client-s3`, even though L'Ayalga does not enable that plugin.
- Chose: add `@aws-sdk/client-s3` at the same pinned AWS SDK version, `3.1121.0`.
- Why: the explicit dependency makes both the web build and the external-package AgentCore bundle deterministic without changing runtime behavior.

### Phase 3: Google OAuth local callback ports

- Plan said: register `http://localhost:54321/auth/v1/callback` for the local Supabase OAuth callback.
- Found: this repository configures the local Supabase API on port `54621`; the documented default port and the active project port differ.
- Chose: register both `http://localhost:54321/auth/v1/callback` and `http://localhost:54621/auth/v1/callback`, and keep the application callbacks for localhost and the intended hosted domain in the Supabase redirect allow-list.
- Why: both approved local configurations can complete the provider round trip without weakening the exact redirect allow-list.

### Phase 5: Notification acceptance count

- Plan said: the final demo state contains four notifications to hosts.
- Found: the reconfirmation protocol produces two party chase notifications plus one escalation notification for each of the two hosts.
- Chose: assert four notifications total, including exactly two host escalations.
- Why: this matches the state-machine protocol and keeps recipient-specific idempotency observable.

### Phase 5: Vercel Cron environment contract

- Plan said: `TICK_SECRET` covered `/api/ticks`, and the environment table did not list Vercel's reserved `CRON_SECRET`, `AGENT_ROUTE_SECRET`, `MODEL`, or `HOST_EMAILS` names.
- Found: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; the broader release-probe agent route needs separate authority; the runtime also selects the demo model and claims first-time Google hosts from the other omitted variables.
- Chose: keep `TICK_SECRET` for explicit internal ticks, add a distinct `AGENT_ROUTE_SECRET`, and add `CRON_SECRET`, `MODEL`, and `HOST_EMAILS` to the explicit contract. Configure them for Preview and Production without deploying.
- Why: separate credentials reduce blast radius, and the documented environment now matches the selected executable runtime.

### Phase 2 verification

- Plan-compliance review approved all tasks after the approve, decline, process-restart, reschedule, scheduling, denial, and audit assertions were added.
- Three simplify passes removed schema and type duplication, bounded option searches to 90 days, reduced each search to one house-state load, and made bundle replacement clean and isolated.
- Sequential checks passed: local database reset, typecheck, lint, 48 tests, production build, AgentCore bundle build, root development-dependency preservation, JavaScript syntax check, ZIP integrity, bootstrap verification, actionlint, and `git diff --check`.

### Phase 4 verification

- The Phase 0 `local` verdict made tasks 4.4 and 4.10 conditional skips. The idempotent Scheduler script and IAM policy documents remain ready for an AgentCore retry.
- The local HTTP proof reset the demo twice with byte-identical responses, confirmed Vega, ran the T-3 chase, then ran the 24-hour escalation. It produced one party notification and exactly one host notification for each host.
- A Bedrock-backed local proof was attempted with AWS profile `archy` and region `us-east-1`. It failed at the existing account-level Anthropic use-case gate before the first model response, with the same `ResourceNotFoundException` recorded in Phases 0 and 2. The scripted-model HTTP proof passed.
- Plan-compliance review found and then approved fixes for scheduler synchronization, concurrent open-job creation, partial-delivery retries, reconfirmation-cycle scoping, and complete demo session cleanup.
- Three simplify passes reused the core scheduler port in the EventBridge adapter, checked the retry and reschedule failure boundaries, and kept the external scheduling lock to one network call per persisted job.
- Sequential checks passed: local database reset through the job-idempotency migration, typecheck, lint, 75 tests, production build, and `git diff --check`.

### Phase 3 verification

- English and Spanish routing, host and guest surfaces, demo host sessions, Supabase PKCE callback code, bounded run polling, time-zone rendering, and the Paper Ink responsive UI are implemented.
- The dedicated Google Cloud project `layalga` contains the `L’Ayalga` Web OAuth client. Its hosted and two local Supabase callback URIs are exact. The hosted Supabase Google provider is enabled, the application callback allow-list is exact, and the ignored local environment stores the client values through `supabase/config.toml` indirection.
- The real Google flow for `juan294@gmail.com` reached the localhost PKCE callback and the host allow-list rejected it before the local process was restarted with that address. This verifies the provider, consent, exchange, callback, sign-out, and negative authorization boundary. A positive host-login retry is ready and needs browser action-time approval because it transmits the account name and email to Supabase again.
- All four Playwright journeys passed: guest hold, host capture and private link, interrupt approval and resume, and the Spanish host view.

### Phase 4 recovery hardening

- Scheduler network calls now run outside database transactions. A short database claim ensures only one worker creates the deterministic external schedule, releases failed claims for retry, and cancels an external schedule if the job was concurrently cancelled.
- House-state loading moved into the booking core, agent dependency ports moved into a leaf module, and AgentCore requests are parsed at an explicit unknown-input boundary without a cross-version Zod cast.
- Health now reports stale runs, stale scheduled-job leases, and retrying jobs in one bounded database query and returns a degraded result when operator action is needed.

### Phase 5 local acceptance

- Preview and Production Vercel environment values are configured, including distinct `CRON_SECRET`, `TICK_SECRET`, and `AGENT_ROUTE_SECRET` credentials. No deployment was performed.
- The deterministic four-beat driver passed with two invitations, two visits, one escalated visit, four total notifications, exactly two host escalations, and one approved decision.
- All eight release probes passed against localhost. Probe cleanup deleted only its tagged synthetic records and verified their absence.
- Sequential verification passed after the recovery migrations: database reset, typecheck, lint, 121 tests, 97 covered unit tests, production build, and four Playwright tests. Coverage passed explicit 30% statement/line, 30% function, and 25% branch floors.

### Final pre-launch remediation

- A fresh read-only audit found and fixed stale locale return paths, guest options shown during a new search, household time-zone rendering, undersized utility text, CI test partitioning, missing coverage floors, global demo-job isolation, unbounded guest searches, expired-hold precedence, notification-recipient authority, incomplete same-home constraints, and cross-instance demo mutation races.
- Global cron and hold expiry now exclude demo homes unless the caller supplies a home. Demo reset and clock changes use a durable per-home mutation lease and durable per-session plus global rate buckets.
- Migrations `20260831000900_relationship_tenants.sql` and `20260831001000_demo_mutation_control.sql` applied from a clean reset. The full four-beat demo and all eight release probes passed again after these changes.
- The final simplify review removed app-clock skew from scheduler leases, normalized safe host and guest action errors, moved shared dependencies into leaf ports, and reused pure validation and time helpers.

### Phase 6 deliverables

- The README, Mermaid source, rendered SVG and PNG architecture diagram, video script, Devpost draft, and three builder.aws drafts are complete locally.
- Recording, upload, Devpost filing, production deployment, tag, publication, and GitHub mutations remain separate owner-authorized actions.
