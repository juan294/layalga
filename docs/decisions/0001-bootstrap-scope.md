# ADR 0001: Bootstrap scope and delivery boundaries

## Status

Accepted on 2026-08-29.

## Context

L’Ayalga is a greenfield entry for the AWS Agents for Humans hackathon. The delivery window favors a narrow, demo-led web application while the public submission rules require a newly created, reproducible, open-source project.

## Decision

- Use a main-only repository with implementation branches or worktrees and squash merges.
- Use the cc-rpi blueprint for workflow scaffolding and disclose it as pre-existing tooling.
- Keep the workflow lightweight: targeted tests replace a blanket coverage threshold.
- Use one Strands coordinator agent with deterministic booking tools and approval interrupts.
- Plan for Next.js, TypeScript, PostgreSQL through Supabase, Amazon Bedrock, EventBridge Scheduler, and a timeboxed AgentCore Runtime spike.
- Treat `layalga.thecreativetoken.com` as the intended public hostname. DNS and deployment are not configured by bootstrap.
- Treat the GitHub repository name as `layalga`. Repository creation and push are separate external actions.
- Defer scheduled agents and E2E Pro Waves C through H until product risk or release history justifies them.

## Consequences

The repository is ready for `/brainstorm` and `/plan`, but it is not a runnable application and cannot be released. The first plan must establish the application manifest, dependencies, verification commands, deployment providers, and a tested AgentCore fallback decision.
