# Changelog

All notable changes to L’Ayalga are documented in this file.

## [Unreleased]

## [1.3.10] - 2026-09-13

### Added

- Added a 1200 × 630 social sharing image, multi-size favicon, browser icon, Apple touch icon, and localized Open Graph and Twitter card metadata for English and Spanish links.

### Changed

- Corrected the presenter preparation text so the demo instructions match the current guided flow.

## [1.3.9] - 2026-09-12

### Changed

- The guided demo controls now use calm scenario-start language while retaining the same isolated synthetic reset behavior. This prevents browser presenters from treating the expected demo setup as a destructive production operation that needs another confirmation.

## [1.3.8] - 2026-09-12

### Fixed

- Resumed AgentCore runs now build their public result from the recorded host decision, verified request context, and actual visit state. A model-generated summary can no longer claim that approval was unnecessary or that a reviewed special request did not exist.

### Added

- Added a ChatGPT Work presenter prompt for the recorded English demo, with visible narration, state checks, and controlled pauses beside the built-in browser.

## [1.3.7] - 2026-09-12

### Changed

- The English guided demo now uses the Parker family name throughout the visible
  scenario, seed data, tests, and submission narration.

## [1.3.6] - 2026-09-12

### Changed

- The sign-in page now welcomes visitors to the home without repeating the product name, uses warmer invitation copy, and lets that copy wrap naturally across the available panel width.

## [1.3.5] - 2026-09-12

### Fixed

- Agent summaries now render a safe structured subset of Markdown, so headings, tables, lists, emphasis, and code remain readable instead of appearing as raw syntax. Emoji and internal UUIDs are removed at the prompt and presentation boundaries.
- Interrupted runs no longer store or display the Strands interrupt payload as a public result, preventing internal IDs, approval hashes, and policy context from leaking into the run page.
- Resumed-run prompts require the summary to describe the recorded host decision accurately instead of claiming that approval was unnecessary after a host approved the request.

### Changed

- The sign-in page now welcomes hosts and guests with warmer, cooperative language.
- The three published AWS Builder Center articles and their URLs are recorded in the submission documentation.
- The three-minute demo script uses one visible English tab, removes the unreadable architecture cutaway, and closes on the signed-in product instead of the post-cancellation sign-in state.

## [1.3.3] - 2026-09-11

### Changed

- Published the final hackathon judge guide, evidence index, NotebookLM source set, Devpost copy, and four-minute production recording script against the behavior proven in v1.3.2.
- Corrected architecture diagrams and operational-time documentation to show that AgentCore invocations remain open until execution settles and worker leases use PostgreSQL wall time.

## [1.3.2] - 2026-09-11

### Added

- A manually dispatched, approval-gated production workflow validates the exact deployed `main` commit before running the guided demo and all nine release probes with the production runtime, email, and memory assertions.
- Real-browser regression coverage checks the guest visit states and run-status surfaces through categorical computed styles, including colour versus transparency and width versus zero, across light and dark themes.

### Fixed

- Shared run-status design tokens now live on the document root, so timeline surfaces retain their paper, ink, border, and pulse styling wherever the components render.
- AgentCore queued-run invocations now remain open until execution finishes, and worker leases use database wall time so demo-clock jumps cannot reclaim active runs.

### Changed

- The release playbook now defines the protected `production-probes` environment, exact-SHA dispatch procedure, secret rotation rules, and release-system impact for the guarded production probe workflow.

## [1.3.1] - 2026-09-10

### Fixed

- The guest ledger CSS module declared its `--guest-*` design tokens only inside the `.shell` wrapper that v1.3.0's shell unification replaced, so every rule reading them resolved to an invalid `var()` and fell back to initial values: guest form inputs lost their border and 44px height, the teal "Find available stays" primary button rendered as plain text, body copy inherited ink instead of graphite, and the "Manage your visit" disclosure rows lost their separators. The aliases now live on `:root`, where they still follow the season and the theme, and `.shell` keeps its layout properties for the standalone ledger routes. The host components that import the same module (`cancellation-panel`, `host-visit-notes`) never had a `.shell` ancestor and are fixed by the same change (#146).

### Changed

- Closed the remaining gaps against the signed-in shell handoff: the panel eyebrow stacks above the Fraunces heading and is sized like the host panel headings, the lede is sized as panel body copy, a form that opens a panel no longer carries a top rule, the "Manage your visit" disclosure rows are ruled top and bottom at 52px, and the demo guide sits directly inside the dashed demo-tooling zone instead of in a second bordered note (#146).

## [1.3.0] - 2026-09-10

### Changed

- Unified the signed-in shell between host and guest views: sign-out moved into the shared site header (visible whenever a host or guest session is active) and out of the Today hero and the guest ledger card. Both guest routes (`/guest`, `/g/[token]`) are restructured onto the host page's seasonal-hero and panel-grid composition -- a "Find dates" panel and a "Manage your visit" panel (ruled disclosure rows for email reminders, cancellation, and the token page's optional account claim), with the demo guide moved into the same dashed demo-tooling zone the host page uses (#142).

## [1.2.1] - 2026-09-09

### Fixed

- The host dashboard header's sign-out button was nearly unreadable: a transparent, ink-outlined button sitting directly over the hero photo where the veil overlay fades to fully transparent. It now uses the same solid button style as other primary actions (#137).
- The cookie-backed guest session page (`/guest`) had no way to sign out, even though the sign-out endpoint already cleared its session cookies -- only the claimed-account page linked to it. Added the same sign-out control there (#137).

## [1.2.0] - 2026-09-09

### Added

- The site header and sign-in postcard's language switcher becomes a compact `EN ▼` dropdown (opens on click, closes on outside click or Escape) in place of always-visible locale links, and the three-button theme group becomes a single icon button that cycles auto → light → dark (#131).

### Changed

- Batched dependency updates: AWS SDK clients (Bedrock AgentCore, Bedrock runtime, S3, Scheduler, SES) to 3.1127.0, `@supabase/ssr` to 0.12.6, `@supabase/supabase-js` to 2.115.0, `fastify` to 5.12.3, `next` to 16.3.4, `next-intl` to 4.14.2, `zod` to 4.5.4, and dev tooling (`@playwright/test`, `@types/node`, `@types/react-dom`, `eslint-config-next`, `tsx`); `supabase/setup-cli` GitHub Action to v3 (#119, #124, #125, #132).

### Fixed

- The design-sync export for `RunStatusPoller` had drifted from the shipped component (a missing required `events` field and a stale `deadlineAt` prop), crashing its preview cards in the Claude Design project; the sync tooling itself is unaffected by production behavior (#133).

## [1.1.0] - 2026-09-08

### Added

- Host dashboard restructured into a hub-and-spoke IA: a "Today" overview (pending decisions, current visits, invitation capture, demo tooling) plus five sub-routes (`/rooms`, `/calendar`, `/guests`, `/settings`, `/activity`) reached through status-bearing hub cards, each with a breadcrumb back to Today. Underlying functionality is unchanged, only relocated.
- A seasonal-artwork header on the Today overview, cross-fading with the demo clock's date the same way the sign-in postcard already does.
- A theme selector (Auto/Light/Dark) on the sign-in/landing page; it was previously only available once signed in.

### Fixed

- `capture_invitation` bounds `rememberedContext` to five entries of at most 120 characters instead of rejecting the call; a production run had retried after a 121-character recall failed validation.
- `infra/iam/web-bedrock-policy.json` uses region-wildcard foundation-model ARNs in place of per-region entries; the per-region version exceeded the 2048-byte inline user policy size limit on apply (#118).
- `data-theme` is always stamped on `<html>` ("auto" by default) instead of left absent, so design-sync's token scanner can register the dark-theme custom properties a bare `:not([data-theme="light"])` selector hid from it.
- `RunStatusPoller` compared the server's `runs.deadline_at` (computed from a demo home's simulated clock, routinely behind the real wall clock) directly against the browser's real `Date.now()`, so polling stopped before ever making a request even though the run was completing correctly on the backend. It now applies the deadline as a clock-agnostic duration relative to the client's own polling start time.

### Changed

- `infra/iam/web-bedrock-policy.json` allows Sonnet 4.6 as well as 4.5, applied to `layalga-web`, so the `AGENT_RUNTIME=local` fallback can invoke the production model.
- The release procedure applies migrations before the release pull request merges into `main`, and documents `gh pr update-branch` for the up-to-date rule.

### Documentation

- ADR 0002 release addendum for v1.0.0 (runtime versions 20 and 21, bundle versions, the two Sonnet 4.6 findings); playbook status, history, rollback, and measured durations; runtime runbook fallback note; CLAUDE.md deployment state.

## [1.0.0] - 2026-09-05

### Added

- Reproducible local coordination benchmark, separate participant protocol, refreshed product/submission guides and editable architecture diagrams.
- Explicit guest/host cancellation and invitation withdrawal, including retirement of related rooms, jobs, pending decisions and stale queued work (#101).
- Verified, consenting guest reminder contacts, account-free verification and revocable return capabilities; web-only outbox and attempt receipts distinguish accepted, failed and unknown sends. Production IAM and rollout remain pending (#100).
- Informational notes separated from immutable approval requests; hosts can configure versioned household rules under the booking lock (#102, #107).
- Actual guest-room recommendations use bounded party-scoped memory, explain supported preferences and fallbacks, and preserve policy and exact guest choice (#106).
- Decision-first host dashboard, current visit outcomes, automatic secure capture handoff, and reset-separated guided routine/exception scenarios (#104, #105).

### Fixed

- Guided scenario and clock controls wait for their JavaScript handler before accepting clicks, preventing lost starts during a cold page load (#104).
- Invitation access extends through at least checkout plus seven days on confirmation, reschedule and reissue, retaining expiry and revocation checks (#103).
- Guest date defaults and search use household time; expired holds no longer hide rooms, and demo resets renew finite bearer access. Semantic clock controls select actual current reminder jobs, recover eligible delivery retries, preserve unanswered guidance and handle repeated no-work steps (#104).
- A run started synchronously is inserted already claimed, so the per-minute drain can no longer dispatch it first and fail the caller with "Agent run is no longer active". The AgentCore database URL now uses the transaction-mode pooler port (#95).
- Capture conversations no longer feed memory extraction; a separate deterministic capture event omits the `partyName` field. This minimizes stored identity fields but does not remove names from arbitrary free text. Guest prompts steer the model to say "this family".
- The "What L'Ayalga remembers" panel renders preference records as text, one row per record with its date, and hides duplicates.
- The memory seed's forget path is covered end to end so a reseed leaves only the seeded facts.
- `capture_invitation` reuses the invitation a run already captured instead of creating a duplicate when the model calls the tool again; the reuse is recorded as a second `tool_call` audit row.
- Release probes and the shared tagged-artifact cleanup identify captured invitations through the run's enqueue payload and the capture audit row, not the model-restated `raw_message`, which Sonnet 4.6 may return without the probe tag.

### Changed

- Git-triggered Vercel deployments are enabled only for `main`; feature and `develop` previews are disabled (#110).
- The demo sign-in button reads "Enter as Host" instead of the host's name, and the Spanish sign-in tagline is written in Spanish (#94).

### Documentation

- Added a repository review route, rubric evidence cards, agent entry-point links, and a public `/llms.txt` index. Clarified current model configuration, pending video status, and the limits of scripted tests, memory minimization, and tracing.

- System guide, three-minute demo script, host and guest manuals, the Everyday Agents pitch, a Strands usage inventory, a judge guide, a docs index, four supporting diagrams, and a refreshed draw.io architecture view (#94, #96, #97, and this release).

### Changed

- Git-triggered Vercel deployments are enabled only for `main`; feature and `develop` previews are disabled (#110).
- The demo sign-in button reads "Enter as Host" instead of the host's name, and the Spanish sign-in tagline is written in Spanish (#94).

### Documentation

- Added a repository review route, rubric evidence cards, agent entry-point links, and a public `/llms.txt` index. Clarified current model configuration, pending video status, and the limits of scripted tests, memory minimization, and tracing.

- System guide, three-minute demo script, host and guest manuals, the Everyday Agents pitch, a Strands usage inventory, a judge guide, a docs index, four supporting diagrams, and a refreshed draw.io architecture view (#94, #96, #97, and this release).

## [0.5.0] - 2026-09-04

### Added

- Per-run agent timeline on the run status page and the capture poller: every tool call, policy verdict, and applied decision in order, with the runtime that executed the run. Events carry only the kind, time, tool name, and verdict decision.
- OpenTelemetry tracing from the AgentCore runtime through ADOT for Node and Strands 1.16.0, with CloudWatch Transaction Search enabled, 100 percent sampling for the demo, and 14-day retention on the runtime log group. `scripts/enable-transaction-search.sh` applies the account setup.
- Host email pings through Amazon SES: a web-runtime outbox sends one email per consenting host when a run pauses for a decision and when a reconfirmation escalates, idempotent per source, with a per-host consent toggle and a masked address on the host page. Guests never receive email.
- Returning-guest memory through Strands MemoryManager and AgentCore Memory: per-party stores scoped by task, tool-driven recall through `search_memory`, a deterministic capture event that omits the party-name field, and a host panel that lists and forgets what the house remembers.
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
