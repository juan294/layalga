---
description: Release-gate change discipline -- risk classification, budgets, and recovery-state vocabulary for anything that can block a release. Project-specific; not part of the cc-rpi blueprint sync.
paths:
  - docs/release/**
  - .github/workflows/**
  - "**/release*/**"
  - scripts/*release*
---

# Release-Gate Discipline

This project's release design (`docs/release/e2e-pro-playbook.md`) descends
from the same `cc-rpi` blueprint lineage that, in a sibling project (Coach),
accreted into an unusable pipeline through many individually reasonable
hardening commits. See
`docs/research/2026-08-29-release-pipeline-overengineering-audit.md` for the
full audit. These rules exist so this project does not repeat that pattern as
release automation is built out.

## Classify before you gate

Every check that can block a release is Class A, B, C, D, or E (full table in
the playbook's "Release-gate change discipline" section). Only A (stops a
known bad candidate) and B (proves identity/rollback/recovery) may sit on the
mandatory release critical path. C (monitoring/readiness) and D (deep
diagnostics, exploratory, security, performance) belong in normal CI,
scheduled jobs, or an explicit deep-release mode. E (ceremony, duplicated
proof, an analyzer analyzing another analyzer's output) does not get added.

Wrong -- add a new required release check because it "improves safety":

```text
"Let's add a monitoring-freshness check to the release gate, it can't hurt."
```

Right -- classify it first:

```text
Risk class: C (operational readiness, not a candidate defect).
Default authority: asynchronous / separate readiness gate, not the release
critical path. Does not block tagging on its own.
```

## No new gate without the impact section

Before adding or promoting a release-blocking check, write the
"Release-system impact" section from the playbook (risk class, unique risk,
existing coverage, added critical-path time, added external dependencies,
same-candidate recovery behavior, what it replaces). The default answer to
"should this block every release?" is no until that section proves a unique
Class A/B risk.

## Recovery states, not one terminal "blocked"

A repairable observer or environment failure (a flaky CLI watch, a transient
network read) must resolve to `PAUSED` and resume the *same* candidate. Only
an actual candidate defect is `BLOCKED` (new candidate required). A
post-promotion proof failure is `ROLLED_BACK`. A passed production proof with
incomplete tagging is `PUBLICATION_PENDING` (resume publication only, never
redeploy). Collapsing these into one fail-closed state is exactly what turned
transient Coach CI/provider glitches into permanently stuck candidates.

## Duplication is a finding, not a feature

If the same journey or probe already runs at another layer (normal CI,
`/pre-launch`, `/explore-release`), a new release-gate copy of it needs a
stated reason the existing layer doesn't cover, not just "more coverage."
