# Project: L’Ayalga

## One-liner

An AI hospitality coordinator for shared homes that turns informal invitations into confirmed, conflict-aware visits.

## Product Identity

- Repository name: `layalga`
- Intended public URL: `https://layalga.thecreativetoken.com`
- Origin: AWS Agents for Humans hackathon, Everyday Agents track. Judging closed on 2026-10-14. The submission material is in `docs/archive/hackathon/` and describes the hackathon demo, not current behavior.
- Working assessment: `docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md`

## Implemented Stack

- Next.js 16 and TypeScript 6 on the selected Vercel web path
- Strands Agents SDK with durable queued runs, executed on Amazon Bedrock AgentCore Runtime in production (`AGENT_RUNTIME=agentcore`); the local `runAgentTask` worker is the one-flag fallback (the web IAM policy allows Sonnet 4.5 and 4.6)
- Amazon Bedrock Claude Sonnet 4.6 in production (`MODEL=bedrock`); a scripted model for deterministic tests only. Production refuses `MODEL=scripted`, and the AgentCore bundle does not include it
- AgentCore Memory for per-party household preferences and facts (`MEMORY=agentcore`), ADOT tracing to CloudWatch GenAI Observability, and host email pings through Amazon SES (`EMAIL=ses`); consented guest delivery is implemented with separate web-only state and prepared production activation
- PostgreSQL through Supabase for authoritative booking, agent, decision, and scheduling state
- Vercel Cron `/api/ticks` every minute for lease recovery, bounded queue draining, due jobs, and email dispatch; an implemented but unselected EventBridge Scheduler adapter (`SCHEDULER=none` in production)
- Supabase Auth with Google OAuth as the only sign-in. A host signs in only when a `host_identity_claims` row maps their email to a host and home; guests can optionally claim invitations

ADR 0002 records the initial Anthropic access failure, the AgentCore model-and-tool proof, the 2026-09-03 decision that made AgentCore the selected production runtime, and the tracing, memory, and release addenda since.

## Current product

The September 5 completion adds explicit cancellation/withdrawal, stay-aligned access, informational notes separated from immutable approval requests, versioned host policy, verified opt-in guest reminders and return access, and actual preference-informed room ranking. It is in production since v1.0.0 (2026-09-05); guest SES IAM application remains separately authorized rollout work.

The real-use launch ([plan](docs/plans/2026-10-15-real-use-launch.md), [notes](docs/plans/2026-10-15-real-use-launch-notes.md)) prepares the product for one real household. It removes demo mode: the demo sessions and "Enter as" sign-in, the demo API routes, the demo clock, the guided demo and the review-access ledger code. A conversion migration turns home `00000000-0000-4000-8000-000000000001` into the real household: it sets `demo = false`, deletes the synthetic parties, invitations, rooms and demo clock row, and keeps both hosts and their `host_identity_claims`. The hosts then add real rooms in the app. Tests and release probes use real local Supabase sessions and throwaway fixture households. The [current roadmap](docs/roadmap.md) separates released work from the launch steps that remain.

Since v2.5.0 a guest does not need an invitation to start a stay. A host can publish the household name; a guest finds it, signs in with Google (required before any search since v2.5.1), compares dates and rooms and sends a stay request. One host confirms or declines, and confirmation rechecks dates, rooms and household rules before it books. Pending requests do not hold rooms. Four WebMCP tools expose find, search, prepare and receipt; the guest still reviews and sends the request.

## Product Safety Contracts

- The database is authoritative for availability, holds, visits, and household policy. The model must not invent or directly mutate booking state.
- A deterministic policy or hook must interrupt sensitive actions for host approval.
- Tests and release probes use synthetic fixture households that they create and delete. Never write test data into the real household. Tests control time through an injected `FakeClock`; the application uses the system clock.
- Do not expose another guest's identity without approval. Raw host invitation text can contain names; prompt minimization is not general free-text anonymization.
- Guest contact/consent/delivery state belongs to the web boundary and never enters agent prompts or memory. SES acceptance does not prove inbox delivery or a reply.
- Cancellation requires explicit human confirmation; memory recommendations never bypass policy, verified room facts or guest choice.
- Treat a queued acknowledgement as accepted work, not as a completed agent result. Poll the exact run to a terminal state.
- Keep Vercel and AgentCore on separate non-owner database roles. Do not use the database owner URL at runtime.
- Do not add WhatsApp or Twilio integration for the hackathon submission.

## RPI Workflow

This project follows Research-Plan-Implement (RPI), with lightweight phases appropriate to the hackathon deadline.

1. `/rpi-brainstorm` -- Turn the approved assessment into a design brief
2. `/rpi-plan` -- Create a demo-led phased implementation spec
3. `/rpi-implement` -- Execute one phase at a time with review gates
4. `/rpi-validate` -- Verify implementation against the plan

Each phase is its own conversation. STOP after each phase unless the user explicitly says to continue.

## Key Commands

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run test:e2e
pnpm run release:probes -- --target local --base http://127.0.0.1:3008
bash scripts/verify-bootstrap.sh
```

Run verification sequentially. Database-backed tests, browser tests and release probes require the local Supabase stack (`pnpm run db:start`, `pnpm run db:reset`); the release probes also need a running local dev server. Tests build their own fixture households, and browser tests sign hosts in through real local Supabase sessions (`signInAsHost`, `src/test-support/host-session.ts`).

## Git Workflow

- Integration branch: `develop` (GitHub default branch)
- Production branch: `main`; Vercel deploys production from `main`
- Merge strategy: squash through pull requests; feature branches open PRs against `develop`; `develop` is promoted to `main` through a PR at release time
- Implementation happens in temporary branches or isolated worktrees, never directly on `develop` or `main`
- Commit before pulling; verify the current branch before every commit
- Push, GitHub publication, deployment, DNS changes, tags, and releases require separate authorization

Use conventional commits: `feat|fix|test|refactor|chore|docs(scope): description`.

## Deployment

Git-triggered Vercel deployments are enabled only for `main` through `vercel.json` `git.deploymentEnabled`. Feature branches and `develop` must never create preview deployments. Keep this restriction in the first commit pushed for any new branch. GitHub Actions still runs for PRs and pushes to `develop`/`main`; batch reviewed work and pass the applicable checks locally before pushing.

The repository is linked to the Vercel project `thecreativetoken/layalga`, and the Supabase project is configured. Production is live at `https://layalga.thecreativetoken.com`. Production runs v2.5.2 (2026-11-25, main `c1e65fb`, pull request #239, no migrations): the guest conversation field opens only once the page is interactive, and postgres.js 4.1.1 with `max_pipeline: 1` on every production connection, because Supavisor before 2.10 can hang on queries pipelined outside a transaction. AgentCore runtime `layalga_agent-mONXXjFms4` serves version 47, and production probe run 45561298712 passed on `c1e65fb`. It sits on top of v2.5.1 (2026-11-22, main `dc12595`, pull request #231, no migrations): guests sign in with Google before they search for a household, check availability or prepare a stay, and the sign-in restores the selected household and dates. AgentCore version 46 and production probe run 45032233105 passed on `dc12595`. Before that, v2.5.0 (2026-11-21, main `64d6aa1`, pull request #230, AgentCore version 45, probe run 44939708898): guest-initiated booking with published household listings, privately owned stay requests, host confirmation or decline, and four WebMCP tools, with migrations `20261121000100` to `20261121000400`. Before that, v2.4.0 (2026-11-19, main `587f42c`, pull request #229) shipped explicit returning-party choice, shared family names, recoverable invitation links, the 2026-11-18 triage fixes and the Next.js 16.4.6, React 19.3 and Strands 1.25 update, with migrations `20261118000200` and `20261119000100`, AgentCore version 44 and probe runs 44489269729 and 44489594215. Vercel, `.env.agentcore` and the `PROD_LINK_TOKEN_SECRET` copy must hold the same `LINK_TOKEN_SECRET`. Earlier releases: v2.3.1 (2026-10-27, main `a3524ee`, pull request #220, AgentCore version 43), the reliability release, and the web-only security hotfix `339b62a` (2026-10-22, pull request #211, Next.js 16.3.8 to 16.4.2, no version bump or tag), v2.3.0 (2026-10-17, main `af82880`, the sign-in identity release: header account chip, Google account picker, "Household ledger" host title), v2.2.1 (2026-10-17, main `78ddbbc`, a dependency and security update) and v2.2.0 (2026-10-16, main `3e433f1`), which completed the real-use launch by dropping the demo schema. v2.1.0 (2026-10-15) added Google sign-in for real use, the public privacy notice and guest sign-in from the main page; the Google OAuth app is published ("In production"), so any Google account can complete the consent screen. Since v2.5.0 any verified Google account can search listed households and send a request; host pages still need a `host_identity_claims` row. `CHANGELOG.md` and the release playbook hold the earlier release history.

The real-use launch ships in two releases, because migrations run before the web deploy and AgentCore deploys separately. Release 1 (expand) ships the code without demo mode and the conversion migration; the demo schema (`homes.demo`, `demo_clock`, the demo mutation tables, `review_access_events`) stays in the database so the old web app and the old AgentCore bundle keep working during the release window. Release 2 (contract) drops that schema and removes the demo branch from the retention function, and starts only after the AgentCore DEFAULT endpoint serves a recorded bundle that no longer reads the demo schema (`pnpm run contract:preflight`). Release 1 shipped as v2.0.0 on 2026-10-15 with AgentCore runtime version 38; v2.1.0 moved it to version 39. Release 2 shipped as v2.2.0 on 2026-10-16 with AgentCore runtime version 40; v2.2.1 moved it to version 41 and v2.3.0 to version 42.

The production gate is the `Production probes` workflow, dispatched from `main` with the exact deployed commit and the acknowledgement `WRITE PROBE FIXTURE`. It runs `pnpm run release:probes -- --target production` against two fixture households that it creates and deletes; it never reads or writes the real household. Apply migrations with `supabase db push --linked` before merging a release into `main`, because the merge deploys the web app. Follow `docs/release/e2e-pro-playbook.md`; production actions require explicit authorization.

v2.4.0 rolled out in the staged order in the playbook section "v2.4.0 rollout order". After shared names exist, a rollback must keep explicit-party behavior on web and AgentCore; after the first recoverable link, keep a web reader that shows the same link.

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
| Hackathon archive    | `docs/archive/hackathon/`                                            | Hackathon demo as of 2026-10-14; not current state   |
| Docs index           | `docs/README.md`                                                     | One line per document                                |
| Agent reports        | `docs/agents/*-report.md`                                            | Gitignored because the intended repository is public |

<!-- rpi:claude-import:start -->

@AGENTS.md
<!-- rpi:claude-import:end -->
