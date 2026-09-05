# ADR 0001: Bootstrap scope and delivery boundaries

## Status

Accepted on 2026-08-29.

## Context

L’Ayalga is a greenfield entry for the AWS Agents for Humans hackathon. The delivery window favors a narrow, demo-led web application while the public submission rules require a newly created, reproducible, open-source project.

## Decision

- Use a `develop` (integration, GitHub default) and `main` (production) topology with implementation branches or worktrees and squash merges. Amended 2026-08-29: the repository started main-only; `develop` was created the same day, before any application code.
- Use the cc-rpi blueprint for workflow scaffolding and disclose it as pre-existing tooling.
- Keep the workflow lightweight: targeted tests replace a blanket coverage threshold.
- Use one Strands coordinator agent with deterministic booking tools and approval interrupts.
- Plan for Next.js, TypeScript, PostgreSQL through Supabase, Amazon Bedrock, EventBridge Scheduler, and a timeboxed AgentCore Runtime spike.
- Treat `layalga.thecreativetoken.com` as the intended public hostname. DNS and deployment are not configured by bootstrap.
- Treat the GitHub repository name as `layalga`. Repository creation and push are separate external actions.
- Defer scheduled agents and E2E Pro Waves C through H until product risk or release history justifies them.

## Consequences

The repository is ready for `/brainstorm` and `/plan`, but it is not a runnable application and cannot be released. The first plan must establish the application manifest, dependencies, verification commands, deployment providers, and a tested AgentCore fallback decision.

## September 5 implementation addendum

The bootstrap consequences above describe August 29, not the current runnable product. Subsequent releases selected AgentCore Runtime with a local fallback and added durable scheduled jobs, room coordination, memory and host SES pings. The [current completion plan](../plans/2026-09-05-everyday-agents-completion.md) implements cancellation, stay-aligned access, separate notes/requests, host policy settings, verified guest reminders, scoped room-preference ranking and guided synthetic scenarios. These additions remain within the existing web/agent/database boundaries; no new infrastructure channel is selected.

Feature and develop branches must not create Vercel previews. Local verification precedes intentional hosted CI. Production migrations, IAM, deployment, real guest sends and publication require separate authorization; a develop merge is not a release. EventBridge scheduling, remote MCP, direct two-way calendars, WhatsApp/Twilio and per-night room packing remain deferred. The initial bootstrap decisions remain historical context; current operational instructions live in the [release playbook](../release/e2e-pro-playbook.md).
