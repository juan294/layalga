# ADR 0002: Release-gate change discipline

## Status

Accepted on 2026-08-29.

## Context

`docs/research/2026-08-29-release-pipeline-overengineering-audit.md` audits
L'Ayalga's release design against
`~/code/coach/docs/release/release-pipeline-hardening-recovery-case-study.md`,
which documents how a sibling project's release pipeline — built from the
same `cc-rpi` blueprint lineage — became unusable through a long sequence of
individually reasonable hardening commits (evidence manifests, analyzers,
exploratory-charter ceremony, capability/constraint/cadence compilers) that
were each added without a system-level view of total critical-path time,
duplicated proof, or recovery semantics. No single change caused the
failure; the absence of a standing risk classification and budget did.

L'Ayalga has not released anything yet (`docs/release/e2e-pro-playbook.md`
records the release decision as `BLOCKED`), so there is no existing pipeline
to simplify. The playbook already inherited the same lettered Wave A-H gate
taxonomy that grew unbounded in Coach, and ADR 0001 already deferred Waves
C-H by risk — this decision makes that judgment a standing rule instead of a
one-time call, so future contributors classify new gates the same way
without re-deriving the case study each time.

## Decision

- Classify every release-blocking check into risk classes A-E (stops-a-bad-
  candidate, proves-identity/recovery, monitoring-readiness, deep-diagnostic,
  ceremony). Only classes A and B may sit on the mandatory release critical
  path by default.
- Require a "Release-system impact" section (risk class, unique risk,
  existing coverage, added critical-path time, added dependencies, same-
  candidate recovery behavior, what it replaces) before any new gate is
  added or an existing one is promoted from deferred to mandatory.
- Adopt the `PAUSED` / `BLOCKED` / `ROLLED_BACK` / `PUBLICATION_PENDING`
  recovery-state vocabulary for any future release controller, so a
  repairable observer/environment failure never collapses into the same
  terminal state as an actual candidate defect.
- Record these rules in `docs/release/e2e-pro-playbook.md` (the release
  authority document) and in a project-specific rule file,
  `.claude/rules/release-gate-discipline.md`, kept outside the `cc-rpi`
  blueprint's synced rule set (`rpi-details.md`, `push-accountability.md`,
  `deployment-safety.md`, `supabase.md`, `testing.md`) so `/update` cannot
  silently revert it.

## Consequences

Wave A remains the only mandatory release gate today; Wave B activates per
its existing trigger (first deployed candidate); Waves C-H stay deferred
until a specific named risk promotes one, per ADR 0001. Any future proposal
to add a required check, CI job, or evidence artifact to the release path
must carry the impact section above, and any future release-controller
implementation must use the four-state recovery vocabulary rather than one
undifferentiated blocked state. There is no release-duration or workflow-
count budget yet because there is no release history to measure; the
playbook records where that budget will be filled in once a release runs.
