# L’Ayalga — From invitation to arrival

[![CI](https://github.com/juan294/layalga/actions/workflows/ci.yml/badge.svg)](https://github.com/juan294/layalga/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178C6.svg)](https://www.typescriptlang.org/)
[![Strands Agents](https://img.shields.io/badge/Strands_Agents-1.16.0-232F3E.svg)](https://strandsagents.com/)

Two hosts share a rural home, but invitations arrive as informal messages and overlapping stays need more judgment than a normal calendar can provide. L’Ayalga turns each message into a private guest link, finds safe dates and guest-visible rooms, confirms exact room choices, follows up before arrival, and asks a host only when a social exception needs a human decision. The calendar is the result of that coordination, not the product.

## Evaluate this project

Start with the [judge guide](docs/submission/judge-guide.md), [Strands implementation inventory](docs/submission/strands-usage.md), [measured synthetic evidence](docs/submission/coordination-evidence.md), or [documentation index](docs/README.md). The [host](docs/guides/host-manual.md) and [guest](docs/guides/guest-manual.md) manuals describe complete journeys; the [roadmap](docs/roadmap.md) separates implemented work from the remaining human and operational steps.

The September 5 completion is implemented and locally verified. It has not been promoted to production by this work. Historical production evidence and current source verification are labeled separately. Human time savings have not been measured; the video and public Builder posts remain owner tasks.

![L’Ayalga architecture](docs/architecture/layalga-architecture.svg)

## Four-beat demo

1. Enter as Host from `/en/sign-in` or `/es/sign-in`. Start the guided Vega scenario; its explicit reset clears the shared synthetic household. Two adults and two children choose both open rooms and receive a routine confirmation. Informational notes do not become approval requests.
2. Advance to the next guest reminder, return as Vega and reconfirm. The current visit outcome changes from waiting to reconfirmed. The clock runs the saved schedule; it does not fabricate activity.
3. Start the independent Otero scenario with a fresh reset. Two adults and a dog request ground-floor access. Choose the Garage Room; the captured explicit request pauses for a host to review. Ground floor is not proof of accessibility.
4. Approve the exact request, advance to the next reminder and leave it unanswered. Advance to host follow-up to see escalation. Cancellation, room administration, private blocks and revocable calendar feeds are additional complete workflows described in the guides.

Starting either scenario resets the shared demo for all viewers. The separate full release driver also proves room proposals, withheld-room opening, overflow approval and calendar privacy. Demo guest email is always suppressed.

The guest names, messages, visits, and notifications in the demo are synthetic; the rooms use generic labels (Guest Room, Garage Room, Office Room) rather than the real house layout. Juan González and Jordan Lynn are the two real host operators.

## How it works

[The architecture source](docs/architecture/layalga-architecture.mmd) shows the web and agent boundaries. Next.js accepts work into a durable PostgreSQL queue. The selected runtime architecture dispatches to Amazon Bedrock AgentCore Runtime. The repository model configuration selects Claude Sonnet 4.6; the release must verify the deployed model and matching IAM allowlist. Local verification uses the scripted model through the same agent factory, hooks and storage. Executed agent completions record `executedOn`; retired cancellation work instead records its cancellation outcome. Vercel Cron recovers leases, drains queued runs and runs due follow-up jobs; PostgreSQL remains authoritative.

AgentCore Memory supports party-scoped recall, and current guest searches use bounded remembered preferences to rank feasible rooms. Guests retain exact room choice; memory never overrides capacity, policy or host approval. ADOT supplies runtime traces. The web runtime owns separate host and guest email paths. Guest reminders require verified contact and explicit consent; their production activation is still pending. [ADR 0002](docs/decisions/0002-agent-runtime.md) preserves the dated runtime history.

### Deterministic policy, model-driven coordination

The model structures informal text, selects typed tools, and writes bilingual messages. Code and database constraints own every consequential state change:

- A pure policy function applies room capacity and versioned host settings for overlapping families with children and pets in a fixed order.
- Informational notes remain separate from persisted explicit requests that require a host decision.
- PostgreSQL range and exclusion constraints stop two concurrent requests from assigning the same room.
- A Strands `BeforeToolCallEvent` hook checks the policy before hold, confirm, or reschedule tools.
- Postgres stores the full Strands session snapshot and the separate host decision record.
- Queued runs use bounded attempts and leases, so a failed web process does not lose accepted work.
- Scheduled jobs retry after one and five minutes, then enter operator-visible quarantine after a third failure.
- Scheduled jobs and notification idempotency keys make retries safe.

The following abbreviated sketch illustrates the policy hook; [the current implementation](src/agent/policy-hook.ts) also restores trusted request data and rechecks current room facts:

```ts
agent.addHook(BeforeToolCallEvent, async (event) => {
  if (!GATED.has(event.toolUse.name)) return;
  const { homeId, draft, approvalStayHash } = await loadDraftForTool(
    deps,
    event.toolUse.name,
    asObject(event.toolUse.input),
  );
  const verdict = evaluateOverlap(
    draft,
    await loadHouseState(deps, homeId, draft),
  );

  if (verdict.decision === "deny") event.cancel = denyMessage(verdict);
  if (
    verdict.decision === "interrupt" &&
    !approvalCovers(draft, approvalStayHash)
  ) {
    const response = event.interrupt<HostDecision>({
      name: "host_decision",
      reason: verdict,
    });
    if (!response.approved) event.cancel = "Declined by host";
  }
});
```

When the hook interrupts, Strands saves the pending tool execution in Postgres. A host records an `approved` or `declined` decision. A new run then restores the session, consumes the response, and writes a `decision_applied` audit event. The application records the decision application and tests idempotent resume, including across processes. Cancellation retires outstanding work so an old approval cannot resurrect a withdrawn request.

## Rooms, agents, and the household calendar

The checked-in demo inventory is synthetic. The repository does not contain the real house plan, photographs, source paths, or a real household room list. A host enters real room facts in the authenticated room ledger: the guest label, floor label, sleeping arrangement, standard and maximum capacity, inventory state, and any overflow arrangement. A draft or incomplete room stays unavailable. A withheld room appears to guests only when a host opens it for the full requested stay.

Guests search with dates and party counts, then select one or more exact rooms. Search and submission use the same deterministic room services. The booking transaction reads availability again before it writes the hold. A guest can see the guest-visible labels for the rooms assigned to their own visit. They cannot see hidden rooms, internal room names, private room notes, or another guest's assignment.

Agent-first controls keep consequential work visible:

- A host can describe a private block, opening, or closure in natural language. Strands resolves guest-safe room facts and creates a pending proposal. Only an authenticated host can review and apply it.
- If the browser provides `document.modelContext`, the host and guest pages register bounded WebMCP tools. Read tools return visible, untrusted page data. Preparation tools fill the visible form but never submit it.
- WebMCP is progressive enhancement. All normal host and guest controls work without browser support for the experimental API.

The host can issue separate, revocable iCalendar subscription URLs. The database stores only a purpose-bound HMAC of each token. Calendar events use generic labels such as `Guest stay` and `Private room use`; they contain guest counts and guest-visible room labels only. This repository proves the feed with local tests and a local calendar parser. It does not subscribe a real family calendar, write directly to Google Calendar or iCloud, or perform two-way synchronization.

Telegram and a remote MCP server are follow-ons. They need separate identity binding, consent, OAuth resource binding, revocation, and rate-limit designs before they can use the same services safely.

## What L’Ayalga remembers

Each party has an AgentCore Memory namespace, `/parties/home-<homeId>/party-<partyId>`. Guest agent tasks read only their party; unmatched host capture has read-only household recall. The explicit `search_memory` tool remains visible on the run timeline. Separately, `loadPartyRoomPreferences` reads the current party for actual guest-room recommendations, with bounded pagination, timeout and conservative parsing.

Supported preferences concern ground/upper floor, separate beds or a double bed. Ranking considers only feasible rooms and preserves standard capacity and minimum room count before preferences. The guest sees matched or unavailable preferences, a clear fallback when memory is off or unusable, and can change the selection. A floor label never establishes accessibility.

Structured identity fields are minimized in guest prompts; arbitrary host invitation text can still contain names and is sent to the configured model for capture. Host-capture conversations do not feed memory extraction; a deterministic write records selected invitation facts. This is a specific boundary, not a guarantee that arbitrary free text contains no personal information. Hosts can inspect and erase a party's stored records and raw events. See [data lifecycle](docs/security/data-lifecycle.md) for retention and trace limits.

## Email pings

The existing host outbox sends decision and escalation pings to eligible hosts who have enabled them. The new guest path requires verified contact, explicit consent and a current invitation. Account-free guests review a verification link and confirm with a POST; Google-claimed guests use a server-verified address. Reading a link does not confirm a stay or opt anyone in.

A reminder carries a separate expiring return capability. Opt-out, changed contact, cancellation, invitation revocation and expiry invalidate applicable access or pending delivery. The original private invitation link remains independently usable while valid. Contact and email delivery data stay in web-only tables, outside agent prompts and memory.

The dashboard distinguishes unavailable contact, queued work, provider acceptance, failure and unknown send outcomes. SES acceptance is not inbox delivery or a guest reply. Unknown sends are not blindly retried. Demo homes send no guest email. The [guest-email readiness checklist](docs/release/guest-email-readiness.md) records the prepared IAM change and still-pending production proof.

## Changes and cancellation

Guests can review and explicitly confirm cancellation, including withdrawing an invitation before booking. Hosts have the same scoped review from current visits. Cancellation releases rooms and retires related jobs, pending decisions and stale queued work. A natural-language cancellation request prepares human review; the model cannot silently cancel.

Unbooked invitation links initially last 30 days. Confirmation, rescheduling and reissue preserve finite access through at least checkout plus seven days, with cancellation and revocation still authoritative. Hosts can edit the existing household policy with version checks; changes do not rewrite confirmed stays, and pending approvals are checked against current rules.

## Local setup

Requirements: Node.js 24, pnpm 11, Docker, and Supabase CLI 2.116 or later.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm run db:start
pnpm run db:reset
pnpm run dev
```

For a fully local deterministic run, set these values in `.env.local`:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres
APP_URL=http://localhost:3008
AGENT_RUNTIME=local
MODEL=scripted
SCHEDULER=none
EMAIL=none
MEMORY=none
DEMO_MODE=true
DEMO_SESSION_SECRET=replace-with-at-least-32-random-bytes
LINK_TOKEN_SECRET=replace-with-at-least-32-random-bytes
TICK_SECRET=replace-with-at-least-32-random-bytes
AGENT_ROUTE_SECRET=replace-with-a-different-at-least-32-random-byte-secret
CRON_SECRET=replace-with-at-least-32-random-bytes
CALENDAR_FEED_SECRET=replace-with-a-different-at-least-32-random-byte-secret
GOOGLE_OAUTH_CLIENT_ID=replace-with-google-oauth-client-id
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=replace-with-google-oauth-client-secret
```

Set `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54621` and use the publishable key reported by `supabase status` for this local stack. Real Google OAuth credentials are needed only for Google sign-in, not synthetic demo entry.

Open `http://localhost:3008/en` or `/es`. Use the sign-in page’s demo buttons to enter without Google OAuth. Guest entry issues a bounded 12-hour synthetic session; a demo reset renews seeded bearer links for 30 real days. The fixed synthetic visit dates follow the household demo clock.

An invited guest can use the private link without an account. They can also sign in with Google, claim the matching invitation, and review their visits at `/<locale>/visits`. Signing out does not invalidate the invitation-specific private link.

For real host sign-in, create a Google OAuth web client and enable the Google provider in Supabase. The authorized Google callbacks are the hosted Supabase callback plus both supported local Supabase ports, `54321` and `54621`. Local Supabase allows the exact application return URL `http://localhost:3008/auth/callback` through `supabase/config.toml`. A hosted Supabase project used for local sign-in must allow that same exact application return URL. Keep the client secret in `.env.local`, Supabase Auth, and the deployment secret store only. Before sign-in, provision the normalized email to one explicit host and home in `host_identity_claims`; an unmatched or conflicting identity fails closed. See the [runtime database and identity runbook](docs/release/runtime-database-and-identity.md).

Run the complete local checks in this order:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run test:coverage
pnpm run build
pnpm run test:e2e
pnpm run demo:e2e -- --base http://localhost:3008
pnpm run release:probes -- --base http://localhost:3008
```

The [release verification playbook](docs/release/e2e-pro-playbook.md) contains the exact environment and cleanup contract. The [data lifecycle](docs/security/data-lifecycle.md) defines automatic retention and the Amazon Bedrock prompt boundary.

## Deployment shape

The selected configuration uses Vercel for Next.js and a durable Postgres queue that accepts work, plus a live Amazon Bedrock AgentCore Runtime that dispatches every queued run, drives every scheduled tick, and hosts the Strands agent, its memory recall, and its OpenTelemetry tracing. The web process uses the non-owner `layalga_web` database login; the AgentCore runtime uses the separately granted `layalga_agent` login, deployed per release by `scripts/deploy-agentcore.sh` from the same commit as the web build. Supabase Postgres remains the system of record. `AGENT_RUNTIME=local` remains a fallback when the web model configuration and IAM permissions agree, as explained in the runtime runbook; the repository also contains an EventBridge Scheduler adapter for a future retry-path change.

Git-triggered Vercel deployment is enabled only for `main`; feature branches and `develop` never create previews. Run applicable checks locally before a reviewed push or PR triggers hosted CI. Production deployment, DNS changes, publication, and release tags require explicit owner authorization. A successful local build does not authorize any of those actions.

## Safety contracts

- Each guest URL is scoped to one invitation. URLs contain high-entropy tokens; only invitation-scoped HMACs are stored.
- Guest views never reveal another party name or room assignment. A guest sees only the guest-visible room labels available to them and the labels assigned to their own visit.
- Draft, inactive, incomplete, closed, occupied, and unopened withheld rooms fail closed in guest availability.
- Private room notes, private block notes, internal room names, calendar feed tokens, and real house source material stay outside guest and agent outputs.
- Calendar subscription URLs are bearer capabilities. Store them as secrets and revoke a feed if its URL is exposed.
- Host access uses Supabase Google Auth, with a normalized email mapped to one explicit host and home. Synthetic demo cookies work only for demo homes when `DEMO_MODE=true`.
- Public tables have RLS enabled and no direct client policies. Hosted web and agent processes use separate non-owner PostgreSQL roles with explicit object grants; migration and release operations use a separate administrative connection.
- Policy runs before consequential tools, and the database independently enforces room exclusivity.
- Run, decision, tool, scheduler, and notification actions are auditable.
- A daily state-aware retention job minimizes terminal prompt/session data while preserving active interrupts, pending decisions, open jobs and audit metadata. The booking-content sweep excludes demo fixtures; guest-contact/outbox cleanup has its own retention rules.
- Synthetic release probes tag and delete only their own data.
- Guest memory reads are party-scoped; host capture extraction is disabled, and deterministic capture memory omits structured names. Arbitrary raw invitation text can contain personal information. Hosts can erase party memory.
- Guest reminders require verified consent, current access and live source checks. Send receipts distinguish provider acceptance, definite failure and unknown outcomes; demo guest delivery is suppressed.

## Hackathon disclosure

This repository was created during the hackathon submission period. The pre-existing cc-rpi project (v1.28.2 at bootstrap, synced to v1.29.0 on 2026-09-01) supplied development-process scaffolding such as command, rule, and document templates. All L’Ayalga product code, data design, UI, agent behavior, tests, diagrams, and submission content were created during the submission period.

The demonstration uses synthetic guest data and suppresses guest email. Real consented guest email is implemented with production activation pending. The project does not integrate with WhatsApp or require real family information for evaluation.

## License

[MIT](LICENSE)
