# L’Ayalga — From invitation to arrival

[![CI](https://github.com/juan294/layalga/actions/workflows/ci.yml/badge.svg)](https://github.com/juan294/layalga/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178C6.svg)](https://www.typescriptlang.org/)
[![Strands Agents](https://img.shields.io/badge/Strands_Agents-1.16.0-232F3E.svg)](https://strandsagents.com/)

Two hosts share a rural home, but invitations arrive as informal messages and overlapping stays need more judgment than a normal calendar can provide. L’Ayalga turns each message into a private guest link, finds safe dates and guest-visible rooms, confirms exact room choices, follows up before arrival, and asks a host only when a social exception needs a human decision. The calendar is the result of that coordination, not the product.

## Evaluate this project

Start with the [judge guide](docs/submission/judge-guide.md) for the rubric and a short repository tour. The [evidence guide](docs/submission/evidence.md) pairs distinctive design choices with implementation, tests, and evidence limits. Explore the [Strands SDK inventory](docs/submission/strands-usage.md), [architecture and text diagrams](docs/architecture/README.md), or [full documentation index](docs/README.md).

![L’Ayalga architecture](docs/architecture/layalga-architecture.svg)

## Four-beat demo

1. Juan pastes a Spanish invitation for Familia Vega. The agent structures the party, searches what it remembers about this family, and creates a private guest link.
2. Juan asks the coordinator to reserve the Garage Room for private household use. The agent prepares a bounded proposal, Juan reviews and applies it, and the room leaves guest options for those dates.
3. Vega selects dates and more than one exact room from the Guest Room and Office Room. A standard-capacity choice proceeds. A separate overflow-only choice pauses with the exact sleeping arrangement until a host approves it; both hosts get an email ping the moment the decision is pending.
4. The host issues a revocable household calendar feed and proves it with a local parser. The feed contains generic all-day events and guest-visible room labels, but no guest names, private notes, invitation data, or bearer tokens. The labeled synthetic clock then demonstrates reconfirmation and escalation, and a second host email ping when a party misses its window.

The guest names, messages, visits, and notifications in the demo are synthetic; the rooms use generic labels (Guest Room, Garage Room, Office Room) rather than the real house layout. Juan González and Jordan Lynn are the two real host operators.

## How it works

[The architecture source](docs/architecture/layalga-architecture.mmd) shows the selected production path. Next.js runs the web UI and accepts work into a durable Postgres run queue. Production dispatch sends each queued run to a live Amazon Bedrock AgentCore Runtime, a Node 22 direct-code deployment running the Strands agent with Amazon Bedrock Sonnet 4.6; tests and the deterministic demo driver use a scripted model instead. The per-minute Vercel Cron route recovers expired leases, drains queued runs, and claims due scheduled jobs, all dispatched through the same AgentCore runtime. Supabase Postgres remains authoritative for invitations, visits, runs, session snapshots, decisions, scheduled jobs, notifications, and audit events; every terminal run result records `executedOn` so a run proves where it ran.

The AgentCore runtime also carries the agent's two supporting systems. Strands `MemoryManager`, backed by AgentCore Memory, lets the coordinator recall a returning family's arrival habits, room needs, pets, and accessibility needs across invitations, with party-scoped access and capture extraction disabled; a host can see and erase what is remembered per family from the host page. ADOT for Node auto-instruments every run, so each agent cycle, model call, and tool call appears as a trace in CloudWatch GenAI Observability. Separately, the Vercel web runtime sends a host-only email ping through Amazon SES whenever a run pauses for a decision or a reconfirmation escalates; guests never receive email. The path from the first authorized Bedrock model call through the selected production runtime is recorded in [ADR 0002](docs/decisions/0002-agent-runtime.md).

### Deterministic policy, model-driven coordination

The model structures informal text, selects typed tools, and writes bilingual messages. Code and database constraints own every consequential state change:

- A pure policy function applies beds, children, and pets rules in a fixed order.
- PostgreSQL range and exclusion constraints stop two concurrent requests from assigning the same room.
- A Strands `BeforeToolCallEvent` hook checks the policy before hold, confirm, or reschedule tools.
- Postgres stores the full Strands session snapshot and the separate host decision record.
- Queued runs use bounded attempts and leases, so a failed web process does not lose accepted work.
- Scheduled jobs retry after one and five minutes, then enter operator-visible quarantine after a third failure.
- Scheduled jobs and notification idempotency keys make retries safe.

This simplified sketch shows the policy boundary. The complete hook also sanitizes inputs and refreshes room and policy state after approval (`src/agent/policy-hook.ts:37`):

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

When the hook interrupts, Strands saves the pending tool execution in Postgres. A host records an `approved` or `declined` decision. A new run then restores the session, consumes the response, and writes a `decision_applied` audit event. The cross-process regression test checks that the approved hold tool and decision audit are applied once (`src/agent/interrupt-resume.test.ts:111`). That test covers this recovery path, not every distributed failure case.

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

Each returning family's preferences persist in AgentCore Memory through Strands `MemoryManager`, scoped one namespace per party (`/parties/home-<homeId>/party-<partyId>`) under a single household memory resource. A guest task can only recall its own party's namespace; a host task without a matched party reads the whole home's namespace read-only. Recall is tool-driven, never injected into the prompt: the agent calls `search_memory` explicitly, and that call appears as a `search_memory` row on the run timeline. Two extraction strategies turn a party's captured invitations and confirmed visits into durable preferences and facts, each with a 30-day event expiry on the raw conversational events; long-term records persist until a host erases them.

Guest prompt templates omit the stored family-name field. Host capture retains the invitation text needed for interpretation and is excluded from conversation extraction; its separate memory event omits the `partyName` field. These are specific data-minimization controls, not general anonymization: names can still appear in free text, structured request text, or tool content. The [data lifecycle](docs/security/data-lifecycle.md) describes provider, memory, and trace boundaries separately. The host page's "What L’Ayalga remembers" panel lists each party's current records; a Forget button deletes every record and raw event for that party and writes an auditable `memory_forgotten` event.

## Email pings

When a run pauses for a host decision, or a reconfirmation escalates, the web runtime's email outbox sends one email per consenting host through Amazon SES, from `noreply@layalga.thecreativetoken.com`. Guests are never a recipient; the outbox query only ever joins the two real hosts. Delivery is idempotent per host per decision or escalation, so a retried tick or a host reopening the page never duplicates a ping, and each host can turn pings off from the host page at any time. The email itself carries the party name, the stay dates or a generic reconfirmation notice, and a link back to the host page — never a guest link token or a calendar feed URL.

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

Open `http://localhost:3008/en` or `/es`. Use the demo-host buttons to enter without Google OAuth.

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

The selected configuration uses Vercel for Next.js and a durable Postgres queue that accepts work, plus a live Amazon Bedrock AgentCore Runtime that dispatches every queued run, drives every scheduled tick, and hosts the Strands agent, its memory recall, and its OpenTelemetry tracing. The web process uses the non-owner `layalga_web` database login; the AgentCore runtime uses the separately granted `layalga_agent` login, deployed per release by `scripts/deploy-agentcore.sh` from the same commit as the web build. Supabase Postgres remains the system of record. `AGENT_RUNTIME=local` remains available as a one-flag rollback to the durable-queue-only path; the repository also contains an EventBridge Scheduler adapter for a future retry-path change.

Deployment, DNS changes, publication, and release tags require explicit owner authorization. A successful local build does not authorize any of those actions.

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
- A daily state-aware retention job minimizes terminal prompt/session data without deleting active interrupts, pending decisions, open jobs, audit metadata, or demo fixtures.
- Synthetic release probes tag and delete only their own data.
- Guest memory is party-scoped; host capture is excluded from conversation extraction, and its separate memory event omits the family-name field. Free text is not guaranteed anonymous. Hosts can erase party records and raw events.
- Email pings go to hosts only, never guests, are idempotent per event and per host, and a host can turn them off.

## Hackathon disclosure

This repository was created during the hackathon submission period. The pre-existing cc-rpi project (v1.28.2 at bootstrap, synced to v1.29.0 on 2026-09-01) supplied development-process scaffolding such as command, rule, and document templates. All L’Ayalga product code, data design, UI, agent behavior, tests, diagrams, and submission content were created during the submission period.

The project uses synthetic demonstration data only. It does not integrate with WhatsApp, send real guest messages, or require real family information.

## License

[MIT](LICENSE)
