# L’Ayalga — From invitation to arrival

[![CI](https://github.com/juan294/layalga/actions/workflows/ci.yml/badge.svg?branch=develop&event=push)](https://github.com/juan294/layalga/actions/workflows/ci.yml?query=branch%3Adevelop+event%3Apush)
[![CodeQL](https://github.com/juan294/layalga/actions/workflows/codeql.yml/badge.svg?branch=develop&event=push)](https://github.com/juan294/layalga/actions/workflows/codeql.yml?query=branch%3Adevelop+event%3Apush)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24-43853D?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.3.4-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19.2.8-61DAFB?logo=react&logoColor=black)
[![Strands Agents](https://img.shields.io/badge/Strands_Agents-1.16.0-232F3E)](https://strandsagents.com/)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![AgentCore Runtime](https://img.shields.io/badge/AgentCore-Runtime-00A88F?logo=amazonwebservices&logoColor=white)](https://aws.amazon.com/bedrock/agentcore/)
[![AgentCore Memory](https://img.shields.io/badge/AgentCore-Memory-00A88F?logo=amazonwebservices&logoColor=white)](https://aws.amazon.com/bedrock/agentcore/)
[![Amazon Bedrock](https://img.shields.io/badge/Amazon-Bedrock-00A88F?logo=amazonwebservices&logoColor=white)](https://aws.amazon.com/bedrock/)
[![Amazon S3](https://img.shields.io/badge/Amazon-S3-3F8624?logo=amazonwebservices&logoColor=white)](https://aws.amazon.com/s3/)
[![AWS IAM](https://img.shields.io/badge/AWS-IAM-DD344C?logo=amazonwebservices&logoColor=white)](https://aws.amazon.com/iam/)
[![Amazon SES](https://img.shields.io/badge/Amazon-SES-5A30B5?logo=amazonwebservices&logoColor=white)](https://aws.amazon.com/ses/)
[![Amazon CloudWatch](https://img.shields.io/badge/Amazon-CloudWatch-E7157B?logo=amazonwebservices&logoColor=white)](https://aws.amazon.com/cloudwatch/)
[![AWS X-Ray](https://img.shields.io/badge/AWS-X--Ray-E7157B?logo=amazonwebservices&logoColor=white)](https://aws.amazon.com/xray/)
[![AWS Distro for OpenTelemetry](https://img.shields.io/badge/AWS_Distro_for-OpenTelemetry-8C4FFF?logo=opentelemetry&logoColor=white)](https://aws.amazon.com/otel/)

<a href="https://chapa.thecreativetoken.com/u/juan294">
  <img src="https://chapa.thecreativetoken.com/u/juan294/badge.svg" alt="juan294's Chapa Impact Badge" width="100%" />
</a>

Two hosts share a rural home, but invitations arrive as informal messages and overlapping stays need more judgment than a normal calendar can provide. L’Ayalga turns each message into a private guest link, finds safe dates and guest-visible rooms, confirms exact room choices, follows up before arrival, and asks a host only when a social exception needs a human decision. The calendar is the result of that coordination, not the product.

## Documentation

The [documentation index](docs/README.md) lists every current document. The [host](docs/guides/host-manual.md) and [guest](docs/guides/guest-manual.md) manuals describe complete journeys; the [roadmap](docs/roadmap.md) separates released work from the remaining steps. L’Ayalga began as an AWS Agents for Humans hackathon entry; the [hackathon archive](docs/archive/hackathon/README.md) keeps the submission material, which describes the judged demo as of 2026-10-14.

Production runs v2.0.0 (2026-10-15), real-use release 1, at commit `e0cb4d1242c777b92a0e3a841081960b174afdbd` with AgentCore runtime version 38. Demo mode is gone: hosts sign in with Google, and the household starts with no rooms. The release passed the production probe gate on fixture households. Release 2, which drops the leftover demo schema, has not run. Human time savings have not been measured; guest-email activation and real-recipient delivery proof remain separate work.

[![Simplified L’Ayalga AWS architecture](docs/architecture/layalga-aws-blog-architecture.drawio.png)](docs/architecture/layalga-aws-blog-architecture.drawio)

## The household

L’Ayalga serves one real household with two hosts, Juan González and Jordan Lynn. Home `00000000-0000-4000-8000-000000000001` was the synthetic demo home during the hackathon. The real-use conversion migration keeps the home, both hosts and their sign-in claims, and deletes the synthetic guests, invitations, rooms and demo clock. The hosts then add the real rooms in the room ledger.

Hosts sign in with Google. A Google account can sign in only when a `host_identity_claims` row maps its email to a host of the household; any other account sees "This Google account is not on the host list for this house." and is signed out. There is no self-service sign-up. The [host manual](docs/guides/host-manual.md) explains how to add a host. Guests do not need an account: each guest uses a private invitation link, and can optionally sign in with Google to claim the invitation.

## How it works

[The architecture source](docs/architecture/layalga-architecture.mmd) shows the web and agent boundaries. Next.js accepts work into a durable PostgreSQL queue. The selected runtime architecture dispatches to Amazon Bedrock AgentCore Runtime. The repository model configuration selects Claude Sonnet 4.6; the release must verify the deployed model and matching IAM allowlist. Tests use a scripted model through the same agent factory, hooks and storage; production refuses `MODEL=scripted`, and the AgentCore bundle does not include it. Executed agent completions record `executedOn`; retired cancellation work instead records its cancellation outcome. Vercel Cron recovers leases, drains queued runs and runs due follow-up jobs; PostgreSQL remains authoritative.

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

The repository contains only synthetic fixtures for development and tests. It does not contain the real house plan, photographs, source paths, or a real household room list. A host enters real room facts in the authenticated room ledger: the guest label, floor label, sleeping arrangement, standard and maximum capacity, inventory state, and any overflow arrangement. A draft or incomplete room stays unavailable. A withheld room appears to guests only when a host opens it for the full requested stay.

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

The dashboard distinguishes unavailable contact, queued work, provider acceptance, failure and unknown send outcomes. SES acceptance is not inbox delivery or a guest reply. Unknown sends are not blindly retried. The [guest-email readiness checklist](docs/release/guest-email-readiness.md) records the prepared IAM change and still-pending production proof.

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

For a fully local run with the scripted test model, set these values in `.env.local`:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres
APP_URL=http://localhost:3008
AGENT_RUNTIME=local
MODEL=scripted
SCHEDULER=none
EMAIL=none
MEMORY=none
LINK_TOKEN_SECRET=replace-with-at-least-32-random-bytes
TICK_SECRET=replace-with-at-least-32-random-bytes
AGENT_ROUTE_SECRET=replace-with-a-different-at-least-32-random-byte-secret
CRON_SECRET=replace-with-at-least-32-random-bytes
CALENDAR_FEED_SECRET=replace-with-a-different-at-least-32-random-byte-secret
GOOGLE_OAUTH_CLIENT_ID=replace-with-google-oauth-client-id
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=replace-with-google-oauth-client-secret
```

Set `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54621` and use the publishable key reported by `supabase status` for this local stack.

`pnpm run db:reset` loads a small local development household: one home, three rooms and two hosts. Its two host claims map the two operators' Google addresses, the same mapping the production household uses. To sign in locally as someone else, map your own Google email to one of the local hosts with a `host_identity_claims` row, as the [runtime database and identity runbook](docs/release/runtime-database-and-identity.md) describes.

Browser tests do not need Google. They create their own fixture household and sign a host in through the local Supabase email provider with `signInAsHost` (`src/test-support/host-session.ts`). That helper refuses any Supabase URL that is not `127.0.0.1` or `localhost`.

An invited guest can use the private link without an account. They can also sign in with Google, claim the matching invitation, and review their visits at `/<locale>/visits`. Signing out does not invalidate the invitation-specific private link.

To configure Google sign-in, create a Google OAuth web client and enable the Google provider in Supabase. The authorized Google callbacks are the hosted Supabase callback plus both supported local Supabase ports, `54321` and `54621`. Local Supabase allows the exact application return URL `http://localhost:3008/auth/callback` through `supabase/config.toml`. A hosted Supabase project used for local sign-in must allow that same exact application return URL. Keep the client secret in `.env.local`, Supabase Auth, and the deployment secret store only. Before sign-in, provision the normalized email to one explicit host and home in `host_identity_claims`; an unmatched or conflicting identity fails closed. See the [runtime database and identity runbook](docs/release/runtime-database-and-identity.md).

Run the complete local checks in this order:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run test:coverage
pnpm run build
pnpm run test:e2e
pnpm run release:probes -- --target local --base http://127.0.0.1:3008
```

The release probes need a running local dev server. They create two fixture households, run every local probe on them and delete them. The [release verification playbook](docs/release/e2e-pro-playbook.md) contains the exact environment and cleanup contract. The [data lifecycle](docs/security/data-lifecycle.md) defines automatic retention and the Amazon Bedrock prompt boundary.

## Deployment shape

The selected configuration uses Vercel for Next.js and a durable Postgres queue that accepts work, plus a live Amazon Bedrock AgentCore Runtime that dispatches every queued run, drives every scheduled tick, and hosts the Strands agent, its memory recall, and its OpenTelemetry tracing. The web process uses the non-owner `layalga_web` database login; the AgentCore runtime uses the separately granted `layalga_agent` login, deployed per release by `scripts/deploy-agentcore.sh` from the same commit as the web build. Supabase Postgres remains the system of record. `AGENT_RUNTIME=local` remains a fallback when the web model configuration and IAM permissions agree, as explained in the runtime runbook; the repository also contains an EventBridge Scheduler adapter for a future retry-path change.

Git-triggered Vercel deployment is enabled only for `main`; feature branches and `develop` never create previews. Run applicable checks locally before a reviewed push or PR triggers hosted CI. Production deployment, DNS changes, publication, and release tags require explicit owner authorization. A successful local build does not authorize any of those actions.

## Safety contracts

- Each guest URL is scoped to one invitation. URLs contain high-entropy tokens; only invitation-scoped HMACs are stored.
- Guest views never reveal another party name or room assignment. A guest sees only the guest-visible room labels available to them and the labels assigned to their own visit.
- Draft, inactive, incomplete, closed, occupied, and unopened withheld rooms fail closed in guest availability.
- Private room notes, private block notes, internal room names, calendar feed tokens, and real house source material stay outside guest and agent outputs.
- Calendar subscription URLs are bearer capabilities. Store them as secrets and revoke a feed if its URL is exposed.
- Host access uses Supabase Google Auth, with a normalized email mapped to one explicit host and home. Google is the only sign-in.
- Public tables have RLS enabled and no direct client policies. Hosted web and agent processes use separate non-owner PostgreSQL roles with explicit object grants; migration and release operations use a separate administrative connection.
- Policy runs before consequential tools, and the database independently enforces room exclusivity.
- Run, decision, tool, scheduler, and notification actions are auditable.
- A daily state-aware retention job minimizes terminal prompt/session data while preserving active interrupts, pending decisions, open jobs and audit metadata. It applies to every household; guest-contact/outbox cleanup has its own retention rules.
- Release probes write only to fixture households that they create, tag with a run ID and delete. They never read or write the real household.
- Guest memory reads are party-scoped; host capture extraction is disabled, and deterministic capture memory omits structured names. Arbitrary raw invitation text can contain personal information. Hosts can erase party memory.
- Guest reminders require verified consent, current access and live source checks. Send receipts distinguish provider acceptance, definite failure and unknown outcomes.

## Hackathon disclosure

This repository was created during the AWS Agents for Humans hackathon submission period. The pre-existing cc-rpi project (v1.28.2 at bootstrap, synced to v1.29.0 on 2026-09-01) supplied development-process scaffolding such as command, rule, and document templates. All L’Ayalga product code, data design, UI, agent behavior, tests, diagrams, and submission content were created during the submission period. The [public demo video](https://youtu.be/-D3GvJ88-40), [Devpost entry](https://devpost.com/software/l-ayalga) and [submission material](docs/archive/hackathon/README.md) record the judged demo.

Judging closed on 2026-10-14, and the real-use launch removes the demo. The project does not integrate with WhatsApp.

## License

[MIT](LICENSE)
