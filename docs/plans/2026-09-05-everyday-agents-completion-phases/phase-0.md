# Phase 0: Tracking and deployment budget

Plan: `2026-09-05-everyday-agents-completion`. Depends on research and owner authorization.

- [x] Issues #100–#110 created with acceptance criteria.
- [x] Plan reviewed for full accepted scope, dependencies and safety; added pre-visit withdrawal and informational-note visibility/retention from the review.
- [x] Set vercel.json git.deploymentEnabled to main=true, **=false, preserving functions/cron settings.
- [x] Document main-only Git deployment behavior; added Git configuration validates against the current official Git property schema, and prior functions/cron configuration is unchanged.

Pseudocode: git_deploy(branch) := branch == main. No remote deployment invocation. This is configuration, not a new release gate.
