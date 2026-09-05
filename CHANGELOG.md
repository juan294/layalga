# Changelog

All notable changes to L’Ayalga are documented in this file.

## [Unreleased]

### Added

- Reproducible local coordination benchmark, separate participant protocol, refreshed product/submission guides and editable architecture diagrams.
- Explicit guest/host cancellation and invitation withdrawal, including retirement of related rooms, jobs, pending decisions and stale queued work (#101).
- Verified, consenting guest reminder contacts, account-free verification and revocable return capabilities; web-only outbox and attempt receipts distinguish accepted, failed and unknown sends. Production IAM and rollout remain pending (#100).
- Informational notes separated from immutable approval requests; hosts can configure versioned household rules under the booking lock (#102, #107).
- Actual guest-room recommendations use bounded party-scoped memory, explain supported preferences and fallbacks, and preserve policy and exact guest choice (#106).
- Decision-first host dashboard, current visit outcomes, automatic secure capture handoff, and reset-separated guided routine/exception scenarios (#104, #105).

### Fixed

- Invitation access extends through at least checkout plus seven days on confirmation, reschedule and reissue, retaining expiry and revocation checks (#103).
- Guest date defaults and search use household time; expired holds no longer hide rooms, and demo resets renew finite bearer access. Semantic clock controls select actual current reminder jobs, recover eligible delivery retries, preserve unanswered guidance and handle repeated no-work steps (#104).
- A run started synchronously is inserted already claimed, so the per-minute drain can no longer dispatch it first and fail the caller with "Agent run is no longer active". The AgentCore database URL now uses the transaction-mode pooler port (#95).

### Changed

- Git-triggered Vercel deployments are enabled only for `main`; feature and `develop` previews are disabled (#110).
- The demo sign-in button reads "Enter as Host" instead of the host's name, and the Spanish sign-in tagline is written in Spanish (#94).

### Documentation

- System guide, three-minute demo script, host and guest manuals, the Everyday Agents pitch, a Strands usage inventory, a judge guide, a docs index, four supporting diagrams, and a refreshed draw.io architecture view (#94, #96, #97, and this release).

## [0.5.1] - 2026-09-04

### Fixed

- Family names stay out of household memory: capture conversations no longer feed memory extraction, and only the deterministic name-free capture write records a capture. Guest prompts steer the model to say "this family".
- The "What L'Ayalga remembers" panel renders preference records as text, one row per record with its date, and hides duplicates.
- The memory seed's forget path is covered end to end so a reseed leaves only the seeded facts.

## [0.5.0] - 2026-09-04

### Added

- Per-run agent timeline on the run status page and the capture poller: every tool call, policy verdict, and applied decision in order, with the runtime that executed the run. Events carry only the kind, time, tool name, and verdict decision.
- OpenTelemetry tracing from the AgentCore runtime through ADOT for Node and Strands 1.16.0, with CloudWatch Transaction Search enabled, 100 percent sampling for the demo, and 14-day retention on the runtime log group. `scripts/enable-transaction-search.sh` applies the account setup.
- Host email pings through Amazon SES: a web-runtime outbox sends one email per consenting host when a run pauses for a decision and when a reconfirmation escalates, idempotent per source, with a per-host consent toggle and a masked address on the host page. Guests never receive email.
- Returning-guest memory through Strands MemoryManager and AgentCore Memory: per-party stores scoped by task, tool-driven recall through `search_memory`, a deterministic name-free capture write, and a host panel that lists and forgets what the house remembers.
- `--expect-runtime`, `--expect-email`, and `--expect-memory` on the release probes; `scripts/create-memory.sh`, `scripts/seed-memory.ts`, and `--s3-version-id` on `scripts/deploy-agentcore.sh`.
- A light and dark override on top of the seasonal palette, and a signed guest session entry for the demo.

### Changed

- The AgentCore bundle ships ADOT through an explicit include list and excludes the optional `@tobilu/qmd` tree, 38 MiB zipped.
- README, ADR 0002, the release playbook, the runtime identity runbook, the data-lifecycle document, the architecture diagram, the Devpost draft, the video script, and the builder.aws posts describe the shipped state.

### Fixed

- Pinned the patched `@opentelemetry/propagator-jaeger` (GHSA-45rx-2jwx-cxfr).
- Memory failures never fail a run.
- Corrected the sign-in season artwork swap and a site-wide serif regression.

## [0.4.0] - 2026-09-04

### Added

- Made the Amazon Bedrock AgentCore runtime live and selectable for production dispatch: every terminal run result now records `executedOn` (`local` or `agentcore`), bare tasks on AgentCore run to completion through the extracted request handler, and the EventBridge target sends a `scheduled_tick` envelope.
- Added `scripts/deploy-agentcore.sh`, which bundles, uploads, creates or updates the runtime, and waits for `READY`, and `scripts/agentcore-smoke.ts`, which proves a run executed on AgentCore and removes its tagged rows.
- Added `--expect-runtime` to the release probes, which now re-drain every 15 seconds for up to 90 seconds and assert where the capture and resume runs executed.
- Added an agent-process profile to the server environment validator, selected by `AGENT_EXECUTION_RUNTIME=agentcore`, so the runtime container validates only the contract it depends on.
- Redesigned sign-in as a seasonal split postcard with four seasonal illustrations.
- Added the hackathon final-stretch research and plan.

### Fixed

- Pinned the patched `qs` transitive dependency.
- The AgentCore handler logs structured error detail, including zod issue paths, because hand-built zod errors are not `Error` instances.
- The demo driver waits up to 120 seconds for an agent run, covering an AgentCore cold start plus real model latency.
- The temporary-hold path serializes per home with an advisory lock instead of `select ... for update`, so the read-only agent runtime role can apply a host-approved hold; previously the approved overflow hold failed with a permission error and the policy hook opened a second identical decision.
- Reconfirmation delivery is guaranteed by the job engine: when the agent run leaves a chase or escalation recipient without a notification, the engine writes the missing bilingual notification itself and records a `notification_fallback` audit event.

### Changed

- Granted the web IAM user `bedrock-agentcore:InvokeAgentRuntime` on the `layalga_agent` runtimes.
- Demo room names are generic for judges.
- Design-sync conventions header and RoomLedger preview grid fix; worktree checkouts are ignored by git and excluded from vitest.

## [0.3.0] - 2026-09-01

### Added

- Added a seasonal palette that rotates the interface accent through the year.
- Added a dependency and security baseline with issue templates, a pull request template, Dependabot, CodeQL, and dependency review.

### Fixed

- Decoupled door states from the seasonal accent so status colour never shifts with the season.
- Kept the unknown door state visually neutral.
- Fixed mobile viewport units and tap targets across the host and guest journeys.
- Restored 44px touch targets on selects and guest fields.
- Scoped the push accountability hook guards to the git push segment so unrelated commands are no longer intercepted.

### Changed

- Made the host RoomLedger a presentational design-system component.
- Consolidated the September dependency updates.

## [0.2.0] - 2026-08-31

### Added

- Added a real room inventory model with capacities, sleeping arrangements, overflow policies, availability overrides, and private blocks.
- Added agent-first room coordination with guest-safe room tools and host-approved room proposals.
- Added WebMCP tools that read or prepare visible host and guest forms without submitting them.
- Added revocable, privacy-preserving iCalendar feeds.
- Added exact multi-room guest selection and host approval for overflow arrangements.

### Fixed

- Fixed the AgentCore package, runtime import boundary, advisory locking, and streaming response handling.

### Changed

- Generalized room occupancy records so they support guest visits and private household blocks.

## [0.1.2] - 2026-08-30

### Fixed

- Replaced the synthetic host identities with the two real operators, Juan González and Jordan Lynn.
- Preserved Juan’s existing Google account binding while provisioning Jordan’s account for later use.
- Kept demo resets limited to exactly two host recipients so reconfirmation sends one escalation to each host.

### Changed

- Updated the README, architecture diagram, video script, runbook, and Devpost copy to use the real host identities and the `v0.1.2` release target.

## [0.1.1] - 2026-08-30

### Added

- Added bilingual host and private guest journeys for invitation capture, room-aware booking, visit changes, and reconfirmation.
- Added deterministic household policy, durable Strands interrupts, exact host decisions, and auditable resume behavior.
- Added durable queued agent execution, Vercel Cron recovery, bounded scheduled-job retries, and operator-visible quarantine.
- Added optional Google guest claims, a personal visits view, and explicit host identity claims.
- Added the synthetic four-beat demo, mobile browser coverage, and eight release probes with scoped cleanup.

### Fixed

- Bound request sizes, idempotency, rate limits, searches, leases, attempts, and worker concurrency.
- Secured invitation capabilities, tenant relationships, runtime database roles, prompt retention, and nonce-based content security policy.
- Corrected calendar navigation, time-zone rendering, decision re-evaluation, expired holds, localized outcomes, pending controls, target sizes, and WebKit hydration.
- Updated CI test partitioning and browser installation, plus the demo driver and concurrency probe, to follow database, mobile, and queued-run contracts correctly.

### Changed

- Updated architecture, operations, security, release, and submission documentation to match the final pre-launch candidate.
- Removed the unused hosted Supabase secret placeholder from the application environment contract.
