# Research: Release-pipeline over-engineering audit against the Coach case study

Documentation status, September 5, 2026: Historical audit, preserved as the rationale for release-gate discipline. Current operating instructions are in the [release playbook](../release/e2e-pro-playbook.md); current product status is in the [roadmap](../roadmap.md).

## Question

`~/code/coach/docs/release/release-pipeline-hardening-recovery-case-study.md` documents how Coach's release pipeline became unusable through a sequence of individually reasonable hardening commits, and how it was recovered. Does L'Ayalga's current release-pipeline design (docs, rules, commands, CI) already carry any of the same failure patterns, and where?

## Source document summary

The case study's reusable diagnosis (case study lines 67-74, 339-355, 621-673):

- Four concerns were merged into one synchronous release transaction that should be separate: product quality, candidate admission, deployment safety, publication integrity.
- No control classified gates by risk class (A: stops a bad candidate; B: proves identity/rollback/recovery; C: monitoring/operational-readiness; D: deep diagnostics; E: ceremony/duplicated proof). Only A and B belong on the default critical path.
- No budget existed for total release duration, remote workflow count, evidence-object count, or duplicated coverage, so every new gate looked cheap in isolation.
- The failure-state model used one fail-closed terminal state for everything, so a repairable observer error (a flaky CLI watch, a transient readback) permanently blocked a healthy candidate the same as an actual bad candidate.
- Provider contracts (Vercel ignore-command semantics, artifact-download layout) were asserted from mocks, not exercised against the real provider, and the one real ordering bug (case study lines 357-409) blocked four separate release attempts.

The case study's own warning against copying the fix as well as the disease (case study lines 1058-1066): "Do not copy the names `develop`, `main`, `check`, `/api/ready`, Vercel, Supabase, or the Coach stage names... Do not remove a broad production journey only because Coach removed one... Do not weaken exact identity or rollback semantics to save time."

## What exists in L'Ayalga today

L'Ayalga is bootstrap scaffolding from the `cc-rpi` blueprint (`.claude/cc-rpi-sync.json:2-11`, blueprint at `/Users/juan/code/cc-rpi`, `blueprintVersion: "v1.28.2"`). There is no application code, no deployment, and no release has occurred (`docs/release/e2e-pro-playbook.md:5`, `:88-90`).

### Release-gate design already present (`docs/release/e2e-pro-playbook.md`)

- The playbook itself uses a lettered-wave taxonomy, "Wave A" through (implicitly) "Wave H" (`docs/release/e2e-pro-playbook.md:46-57`, `.claude/commands/bootstrap.md:51`, `.claude/commands/adopt.md:104,134,136`). This is the same style of layered, growing gate system the case study's Section "Deep root cause 1: critical-path accretion" (case study lines 339-355) describes accreting inside Coach — capability registries, constraint matrices, environment fidelity, cadence, exploratory charters, evidence manifests, analyzers.
- Only Wave A ("truthful release gate") is currently mandatory; Wave B (`/explore-release`, exploratory charters) is deferred until the first deployed candidate; Waves C-H are explicitly deferred with a stated reason ("greenfield, deadline-bound hackathon build with no production history") (`docs/release/e2e-pro-playbook.md:57`). ADR 0001 records this same deferral decision (`docs/decisions/0001-bootstrap-scope.md:20`).
- The playbook's release procedure (`docs/release/e2e-pro-playbook.md:72-87`) is a single 13-step serial list: local checks -> deploy -> verify both deployed identities -> run required probes -> verify datastore/interrupt/notification/cleanup -> run one fresh-context exploratory charter for the four-beat demo path -> present evidence -> obtain tag/publish authorization -> tag last. Step 10 ("run a fresh-context exploratory charter") is Wave B work stated inside the Wave-A-only release procedure, even though line 57 says Wave B is deferred until the first deployed candidate — the procedure and the adopted-scope section are not yet reconciled.
- No local-admission, delivery, or publication time budget is stated anywhere in the playbook. The case study's step 10 ("Prove the result with acceptance metrics", case study lines 932-947) and its Step 2 inventory table (case study lines 794-816) both make an explicit numeric budget the first artifact of a healthy pipeline; this playbook has none yet (there is nothing to measure against, since there is no release history).
- The playbook's release-authority language ("Wave A is mandatory... It must enforce...", `docs/release/e2e-pro-playbook.md:46`) states required probes and evidence properties but does not yet define recovery semantics for a failed probe — there is no equivalent of the case study's `PAUSED` / `BLOCKED` / `ROLLED_BACK` / `PUBLICATION_PENDING` state vocabulary (case study lines 411-429) to say whether a given required-probe failure should retry the same candidate, require a new candidate, or trigger rollback.

### Exploratory-charter design (`.claude/commands/explore-release.md`)

- This command already implements the case study's own recommended shape for Wave B: independent fresh-context agents (not the implementer), a fixed immutable candidate, a bounded timebox (30 minutes/charter, `.claude/commands/explore-release.md:92-93`), charter count sized to the diff rather than padded (`:49-53`), and an explicit non-negotiable safety contract restricted to synthetic run-scoped fixtures (`:95-105`). This matches Class D framing (deep diagnostic layer, run when justified) rather than a mandatory always-on gate, and is deferred correctly per the playbook.

### Push/CI-repair automation (`.claude/rules/push-accountability.md`, `.claude/skills/ci-workflow/SKILL.md`, `.claude/commands/fix-ci.md`)

- `push-accountability.md:5` states: "After pushing, spawn a background agent to monitor CI. If CI fails, the agent investigates, fixes, and re-pushes." No iteration cap or terminal condition is stated in this file.
- `.claude/commands/fix-ci.md:31,41` (the command the background agent would run) does cap repair at "max 3 iterations" and has an explicit stop condition ("If stuck after 3 fix cycles, stop and report what remains broken").
- The rule and the command it delegates to are consistent in practice (the command's cap governs), but the rule file itself does not restate the cap or the observer-vs-candidate failure distinction the case study's root-cause 3 describes (case study lines 411-429: a transient CLI/observer failure must not be treated the same as a candidate defect).

### Pre-launch audit and remediation (`.claude/commands/pre-launch.md`, `.claude/commands/remediate.md`, `.claude/rules/rpi-details.md`)

- `rpi-details.md`'s Pre-Release Workflow section states: "Fix everything, always: categorize findings by severity, but fix 100%. With AI agents, fix cost is near-zero." One documented exception exists: `/remediate` Wave 3 (Later/strategic) items get issues filed but no fix agents.
- `/pre-launch` is a one-time, 8-specialist, read-only audit that writes a report (`.claude/commands/pre-launch.md:1-2,187`); `/remediate` is the mandatory-fix consumer of that report, with a machine-checked contract (`validate-findings.py`) and an explicit 3-wave split (Before launch / After launch / Later-strategic) where only "Later/strategic" is exempted from mandatory auto-fix (`.claude/commands/remediate.md:351-356`).
- This is a bounded, one-shot activity (an audit-and-fix cycle that runs once, not a permanent gate re-executed on every release), so it does not itself accrete onto the release critical path the way Coach's evidence/analyzer/charter machinery did — but the "fix everything, always" framing does not yet distinguish "this finding is a Class A/B production risk" from "this finding is a Class C/D signal" the way the case study's Step 4 classification requires (case study lines 834-846). Nothing in `rpi-details.md` or `pre-launch.md` currently ties `/pre-launch` findings back to release-gate authority, so there is no existing mechanism by which a pre-launch finding could silently become a new mandatory release gate the way Coach's remediations did — but there is also no explicit rule preventing that outcome if a future finding recommends "add a CI check for X."

### CI surface today (`.github/workflows/ci.yml`)

- One job, `bootstrap-contract`, running `bash scripts/verify-bootstrap.sh` on pull requests and pushes to `main` (`.github/workflows/ci.yml:1-19`). This is the entire current critical path; there is no local mirror, no Preview/staging deployment, no analyzer, and no evidence-manifest machinery yet. There is nothing to simplify here today.

### Deployment-safety guidance (`.claude/rules/deployment-safety.md`, `.claude/skills/deployment-safety/SKILL.md`)

- These already state Class A/B-shaped rules directly (protected-branch-is-production, rollback-first incident recovery, framework upgrades need preview verification before merge, CI-cost justification before every run/deploy/API call) without an evidence-manifest or analyzer layer. Nothing here matches the accreted patterns the case study flags for removal.

## Answer

L'Ayalga has not yet built a release pipeline that exhibits Coach's failure (there is nothing to fail — release is explicitly `BLOCKED`, `docs/release/e2e-pro-playbook.md:90`). What it has inherited from the same `cc-rpi` blueprint lineage is the same *shape* of gate taxonomy that grew unbounded in Coach: a lettered/waved system of release authority (Wave A-H) that can accrete the same way if each future wave or probe is adopted piecemeal without a standing risk classification, a budget, or recovery-state vocabulary. Concretely, before this audit, the project had:

1. No explicit risk-class test (case study Step 4 / "Rules for future automatic remediation proposals") gating whether a new probe, wave, or CI job is allowed onto the mandatory release critical path.
2. No recovery-state vocabulary distinguishing a repairable observer/environment failure from an actual candidate defect, in either the playbook or `push-accountability.md`.
3. One documented, already-reconciled inconsistency: the release procedure's step 10 runs Wave B exploratory-charter work inside the Wave-A-only procedure, ahead of the adopted-scope section's stated Wave B deferral trigger (first deployed candidate).
4. No stated release-duration or workflow-count budget (expected at this stage, since there is no release history yet to measure).

Everything else already present (the Wave A/B/C-H split, the exploratory-charter command's bounded/fresh-context/non-padded design, the deployment-safety rules, the single-job CI) already matches the case study's *recovered* architecture rather than its *pre-recovery* one.
