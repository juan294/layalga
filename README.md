# L’Ayalga — From invitation to arrival

[![CI](https://github.com/juan294/layalga/actions/workflows/ci.yml/badge.svg)](https://github.com/juan294/layalga/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178C6.svg)](https://www.typescriptlang.org/)
[![Strands Agents](https://img.shields.io/badge/Strands_Agents-1.15.0-232F3E.svg)](https://strandsagents.com/)

Two hosts share a rural home, but invitations arrive as informal messages and overlapping stays need more judgment than a normal calendar can provide. L’Ayalga turns each message into a private guest link, finds rooms for partially overlapping visits, confirms safe stays, follows up before arrival, and asks a host only when a social exception needs a human decision. The calendar is the result of that coordination, not the product.

![L’Ayalga architecture](docs/architecture/layalga-architecture.svg)

## Four-beat demo

1. Nel pastes a Spanish invitation for Familia Vega. The agent structures the party and creates a private guest link.
2. Vega selects dates. The deterministic booking engine allocates rooms, places a temporary hold, and confirms the visit.
3. Covadonga independently invites the Oteros for partly overlapping dates. Beds, children, and pets rules pass, but a wheelchair-access request pauses the Strands run. Nel approves it in the host view, and the saved run resumes without repeating the booking tool.
4. The labeled synthetic clock moves to three days before arrival. L’Ayalga asks each party to reconfirm. When one party does not respond for 24 hours, it alerts both hosts.

All names, messages, visits, and notifications in the demo are synthetic.

## How it works

[The architecture source](docs/architecture/layalga-architecture.mmd) shows the selected hackathon path. Next.js runs the web UI and the local Strands runtime on Vercel. Supabase Postgres is authoritative for invitations, visits, runs, session snapshots, decisions, scheduled jobs, notifications, and audit events. A Vercel Cron trigger claims due jobs. Strands can use Amazon Bedrock Sonnet 4.5 when the AWS account has model access; tests and the deterministic demo driver use a scripted model.

Amazon Bedrock AgentCore Runtime was packaged and started successfully during the Phase 0 spike. The account-level Anthropic use-case gate blocked the first model call, so the approved fallback is `AGENT_RUNTIME=local`. The same `runAgentTask` interface and Postgres session storage keep a future AgentCore retry possible without changing the product flow. See [ADR 0002](docs/decisions/0002-agent-runtime.md).

### Deterministic policy, model-driven coordination

The model structures informal text, selects typed tools, and writes bilingual messages. Code and database constraints own every consequential state change:

- A pure policy function applies beds, children, and pets rules in a fixed order.
- PostgreSQL range and exclusion constraints stop two concurrent requests from assigning the same room.
- A Strands `BeforeToolCallEvent` hook checks the policy before hold, confirm, or reschedule tools.
- Postgres stores the full Strands session snapshot and the separate host decision record.
- Scheduled jobs and notification idempotency keys make retries safe.

The central hook is small because the policy is not hidden in a prompt:

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

When the hook interrupts, Strands saves the pending tool execution in Postgres. A host records an `approved` or `declined` decision. A new run then restores the session, consumes the response, and writes a `decision_applied` audit event. The tool executes at most once.

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
HOST_EMAILS=your-google-account@example.com
GOOGLE_OAUTH_CLIENT_ID=replace-with-google-oauth-client-id
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=replace-with-google-oauth-client-secret
```

Open `http://localhost:3008/en` or `/es`. Use the synthetic-host buttons to enter the demo without Google OAuth.

For real host sign-in, create a Google OAuth web client and enable the Google provider in Supabase. The authorized Google callbacks are the hosted Supabase callback plus both supported local Supabase ports, `54321` and `54621`. Local Supabase allows the exact application return URL `http://localhost:3008/auth/callback` through `supabase/config.toml`. A hosted Supabase project used for local sign-in must allow that same exact application return URL. Keep the client secret in `.env.local`, Supabase Auth, and the deployment secret store only.

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

The [release verification playbook](docs/release/e2e-pro-playbook.md) contains the exact environment and cleanup contract.

## Deployment shape

The selected configuration uses Vercel for Next.js, the local `runAgentTask` adapter, and a per-minute Vercel Cron trigger. Supabase Postgres remains the system of record. The repository also contains the tested AgentCore direct-code bundle and EventBridge Scheduler adapters for a later retry after Bedrock model access is active.

Deployment, DNS changes, publication, and release tags require explicit owner authorization. A successful local build does not authorize any of those actions.

## Safety contracts

- Guest URLs contain high-entropy tokens; only token hashes are stored.
- Guest views never reveal another party name or room name.
- Host access uses Supabase Google Auth, with an explicit email allow-list for the first claim. Synthetic demo cookies work only for demo homes when `DEMO_MODE=true`.
- Public tables have RLS enabled and no direct client policies. Server code uses the service connection.
- Policy runs before consequential tools, and the database independently enforces room exclusivity.
- Run, decision, tool, scheduler, and notification actions are auditable.
- Synthetic release probes tag and delete only their own data.

## Hackathon disclosure

This repository was created during the hackathon submission period. The pre-existing cc-rpi v1.28.2 project supplied development-process scaffolding such as command, rule, and document templates. All L’Ayalga product code, data design, UI, agent behavior, tests, diagrams, and submission content were created during the submission period.

The project uses synthetic demonstration data only. It does not integrate with WhatsApp, send real guest messages, or require real family information.

## License

[MIT](LICENSE)
