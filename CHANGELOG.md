# Changelog

All notable changes to L’Ayalga are documented in this file.

## [Unreleased]

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
