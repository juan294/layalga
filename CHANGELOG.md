# Changelog

All notable changes to L’Ayalga are documented in this file.

## [Unreleased]

### Added

- Added a real room inventory model with capacity, sleeping arrangement, overflow policy, and host-controlled availability overrides and private blocks.
- Added agent-first room coordination: guest-safe room-availability and room-listing tools, and a host tool that only prepares a pending room-inventory change for separate human approval.
- Added a WebMCP surface so a host's or guest's own browser page can register read-only and prepare-only tools that reuse the page's existing session authority.
- Added a revocable, per-locale iCal household calendar feed with a bearer-token URL that exposes only generic event kinds, status, guest count, and guest-visible room labels.
- Added a room-selection branch to the policy hook, independent of the existing stay-overlap verdict, that interrupts for host approval on overflow selections and cancels a stale approval if the room arrangement changes while it is pending.

### Fixed

- Fixed the AgentCore package for the retried runtime proof: reduced the deployment bundle from 275MB/113k entries to 62.7MB/17.4k entries, removed a `next/server` import leak from the runtime entrypoint, replaced a permission-conflicting row lock with a transaction-scoped advisory lock, and fixed the client to request a streaming response instead of a non-streaming object.

### Changed

- Renamed the `visitRooms` export to `roomOccupancies` and made the underlying occupancy row polymorphic, so it can back either a guest visit or a host's private room block.

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
