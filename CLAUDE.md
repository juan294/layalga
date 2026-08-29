# Project: L’Ayalga

## One-liner

An AI hospitality coordinator for shared homes that turns informal invitations into confirmed, conflict-aware visits.

## Product Identity

- Repository name: `layalga`
- Intended public URL: `https://layalga.thecreativetoken.com`
- Hackathon: AWS Agents for Humans, Everyday Agents track
- Working assessment: `docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md`

## Planned Stack

- Next.js and TypeScript
- Strands Agents SDK with Amazon Bedrock
- AgentCore Runtime, subject to the documented day-one deployment spike
- PostgreSQL through Supabase for authoritative booking state
- EventBridge Scheduler for reconfirmation jobs

The repository contains bootstrap scaffolding only. The first `/plan` must confirm the application scaffold and exact package versions before adding code.

## Product Safety Contracts

- The database is authoritative for availability, holds, visits, and household policy. The model must not invent or directly mutate booking state.
- A deterministic policy or hook must interrupt sensitive actions for host approval.
- The demo uses synthetic guests and an explicitly labeled injectable clock.
- Do not expose another guest's identity without approval.
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
bash scripts/verify-bootstrap.sh  # Verify the initial cc-rpi scaffold
```

Add `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, and `pnpm run build` when the application scaffold is created. Run verification sequentially.

## Git Workflow

- Integration branch: `main`
- Production branch: `main` once deployment is configured
- Merge strategy: squash through pull requests
- Implementation happens in temporary branches or isolated worktrees, not directly on `main`
- Commit before pulling; verify the current branch before every commit
- Push, GitHub publication, deployment, DNS changes, tags, and releases require separate authorization

Use conventional commits: `feat|fix|test|refactor|chore|docs(scope): description`.

## Deployment

No deployment is configured. The intended web hostname is `layalga.thecreativetoken.com`. AgentCore and web deployment providers must be verified during planning. Follow `docs/release/e2e-pro-playbook.md`; production actions require explicit authorization.

## Agent Behavior

Exhaust CLI and browser automation before asking the user to perform operations. Preserve phase gates and external-action authorization boundaries.

## Project File Locations

| Topic | Path | Notes |
|---|---|---|
| Hackathon assessment | `docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md` | Product and delivery source |
| Research | `docs/research/YYYY-MM-DD-*.md` | Read-only phase output |
| Plans | `docs/plans/YYYY-MM-DD-*.md` | Phase files use `-phases/` |
| ADRs | `docs/decisions/` | Architecture decisions |
| Release procedure | `docs/release/e2e-pro-playbook.md` | Exact-candidate release gate |
| Agent reports | `docs/agents/*-report.md` | Gitignored because the intended repository is public |
