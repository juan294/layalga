# Project: L’Ayalga

## One-liner

An AI hospitality coordinator for shared homes that turns informal invitations into confirmed, conflict-aware visits.

## Product Identity

- Repository name: `layalga`
- Intended public URL: `https://layalga.thecreativetoken.com`
- Hackathon: AWS Agents for Humans, Everyday Agents track
- Working assessment: `docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md`

## Implemented Stack

- Next.js 16 and TypeScript 6 on the selected Vercel web path
- Strands Agents SDK with durable queued runs and a local `runAgentTask` worker
- Amazon Bedrock Sonnet 4.5 when the account model gate is active; a scripted model for deterministic demo and test runs
- PostgreSQL through Supabase for authoritative booking, agent, decision, and scheduling state
- Vercel `after()` for opportunistic local dispatch and Vercel Cron for lease recovery, bounded queue draining, and due jobs; an EventBridge Scheduler adapter for a future AgentCore retry
- Supabase Auth with Google OAuth, optional guest invitation claims, and signed synthetic-demo sessions

ADR 0002 records why the AgentCore package reached `READY` but the selected hackathon runtime remains local: the AWS account rejected the first Anthropic model request before any tool call.

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

The repository is linked to the Vercel project `thecreativetoken/layalga`, and the Supabase project is configured. The intended web hostname is `layalga.thecreativetoken.com`, but no production candidate has been deployed or verified. Follow `docs/release/e2e-pro-playbook.md`; production actions require explicit authorization.

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
| Agent reports        | `docs/agents/*-report.md`                                            | Gitignored because the intended repository is public |
