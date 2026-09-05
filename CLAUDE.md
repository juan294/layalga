# Project: L’Ayalga

## One-liner

An AI hospitality coordinator for shared homes that turns informal invitations into confirmed, conflict-aware visits.

## Product Identity

- Repository name: `layalga`
- Intended public URL: `https://layalga.thecreativetoken.com`
- Hackathon: AWS Agents for Humans, Everyday Agents track
- Working assessment: `docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md`

## Repository review

Start with the [judge guide](docs/submission/judge-guide.md) for the rubric and
reading route, then the [evidence index](docs/submission/evidence.md) for source,
tests, operating modes, and limitations. The
[Strands inventory](docs/submission/strands-usage.md) explains SDK choices in
detail. These documents support independent evaluation; they do not prescribe
a score.

## Implemented Stack

- Next.js 16 and TypeScript 6 on the selected Vercel web path
- Strands Agents SDK with durable queued runs, executed on Amazon Bedrock AgentCore Runtime in production (`AGENT_RUNTIME=agentcore`); the local `runAgentTask` worker is the one-flag rollback
- Amazon Bedrock Claude Sonnet 4.6 in production (`MODEL=bedrock`); a scripted model for deterministic demo and test runs
- AgentCore Memory for per-party household preferences and facts (`MEMORY=agentcore`), ADOT tracing to CloudWatch GenAI Observability, and host-only email pings through Amazon SES (`EMAIL=ses`)
- PostgreSQL through Supabase for authoritative booking, agent, decision, and scheduling state
- Vercel Cron `/api/ticks` every minute for lease recovery, bounded queue draining, due jobs, and email dispatch; an implemented but unselected EventBridge Scheduler adapter (`SCHEDULER=none` in production)
- Supabase Auth with Google OAuth, optional guest invitation claims, and signed synthetic-demo sessions

ADR 0002 records the initial Anthropic access failure, the AgentCore model-and-tool proof, the 2026-09-03 decision that made AgentCore the selected production runtime, and the tracing, memory, and release addenda since.

## Product Safety Contracts

- The database is authoritative for availability, holds, visits, and household policy. The model must not invent or directly mutate booking state.
- A deterministic policy or hook must interrupt sensitive actions for host approval.
- The demo uses synthetic guests and an explicitly labeled injectable clock.
- Do not expose another guest's identity without approval.
- Treat a queued acknowledgement as accepted work, not as a completed agent result. Poll the exact run to a terminal state.
- Keep Vercel and AgentCore on separate non-owner database roles. Do not use the database owner URL at runtime.
- Do not add WhatsApp or Twilio integration for the hackathon submission.

## RPI Workflow

This project follows Research-Plan-Implement (RPI), with lightweight phases appropriate to the hackathon deadline.

1. `/brainstorm` -- Turn the approved assessment into a design brief
2. `/plan` -- Create a demo-led phased implementation spec
3. `/implement` -- Execute one phase at a time with review gates
4. `/validate` -- Verify implementation against the plan

Each phase is its own conversation. STOP after each phase unless the user explicitly says to continue.

## Key Commands

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run test:e2e
pnpm run demo:e2e
pnpm run release:probes
bash scripts/verify-bootstrap.sh
```

Run verification sequentially. Database-backed tests, browser tests, the demo driver, and release probes require the local Supabase stack and demo seed.

## Git Workflow

- Integration branch: `develop` (GitHub default branch)
- Production branch: `main`; Vercel deploys production from `main`
- Merge strategy: squash through pull requests; feature branches open PRs against `develop`; `develop` is promoted to `main` through a PR at release time
- Implementation happens in temporary branches or isolated worktrees, never directly on `develop` or `main`
- Commit before pulling; verify the current branch before every commit
- Push, GitHub publication, deployment, DNS changes, tags, and releases require separate authorization

Use conventional commits: `feat|fix|test|refactor|chore|docs(scope): description`.

## Deployment

The repository is linked to the Vercel project `thecreativetoken/layalga`, and the Supabase project is configured. Production is live at `https://layalga.thecreativetoken.com`; v0.4.0 and v0.5.0 were released on 2026-09-04 through the nine-probe gate, with the web app on Vercel and the agent bundle on AgentCore runtime `layalga_agent-mONXXjFms4` deployed from the same commit. Follow `docs/release/e2e-pro-playbook.md`; production actions require explicit authorization.

## Agent Behavior

Exhaust CLI and browser automation before asking the user to perform operations. Preserve phase gates and external-action authorization boundaries.

## Project File Locations

| Topic                | Path                                                                 | Notes                                                |
| -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| Hackathon assessment | `docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md` | Product and delivery source                          |
| Research             | `docs/research/YYYY-MM-DD-*.md`                                      | Read-only phase output                               |
| Plans                | `docs/plans/YYYY-MM-DD-*.md`                                         | Phase files use `-phases/`                           |
| ADRs                 | `docs/decisions/`                                                    | Architecture decisions                               |
| Release procedure    | `docs/release/e2e-pro-playbook.md`                                   | Exact-candidate release gate                         |
| Runtime runbook      | `docs/release/runtime-database-and-identity.md`                      | Database roles, AgentCore identity, job replay       |
| Architecture         | `docs/architecture/`                                                 | Mermaid and draw.io diagrams with README             |
| Security             | `docs/security/data-lifecycle.md`                                    | Retention and prompt boundary                        |
| User manuals         | `docs/guides/`                                                       | Host and guest journeys, non-technical               |
| Submission           | `docs/submission/`                                                   | Devpost, pitch, video script, judge guide, posts     |
| Docs index           | `docs/README.md`                                                     | One line per document                                |
| Agent reports        | `docs/agents/*-report.md`                                            | Gitignored because the intended repository is public |
