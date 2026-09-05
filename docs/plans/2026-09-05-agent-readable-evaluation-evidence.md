# Implementation: agent-readable evaluation evidence

Historical workstream status: the baseline documentation work was implemented
in `1babff56fd4a7914f46dbd00b94db3a41110dea9`. Its scope, observations and
validation remain tied to the recorded baseline; they are not current
completion test totals. The [Everyday Agents completion plan](2026-09-05-everyday-agents-completion.md)
and [judge guide](../submission/judge-guide.md) govern current product status.
[Implementation evidence](../submission/evidence.md) preserves both snapshots;
[coordination evidence](../submission/coordination-evidence.md) records the
separate measured workflow. The authorization statements below describe this
historical workstream, not a new permission request or production authorization.

Source: `docs/research/2026-09-05-agent-readable-evaluation-evidence.md`.
The owner explicitly authorized implementation from the research, inclusion of
`/llms.txt`, completion without phase stops, local merge to `develop`, and worktree
cleanup. This checklist translates those recommendations into executable scope.

Baseline: `develop` at `bf5041601b8910f92e632034c4c21b644dc6a3a9`.
Implementation worktree: `docs/agent-evaluation-evidence`. Product changes in
other worktrees are outside this change.

- [x] Inspect the integration snapshot and isolate implementation.
- [x] Add README, AGENTS, CLAUDE, and Copilot navigation to the canonical guide.
- [x] Extend the judge guide with a repository route and five-criterion evidence map.
- [x] Add source-backed evidence cards, operating modes, and verification status.
- [x] Correct current-facing version, privacy, video, and scope contradictions.
- [x] Add a public `/llms.txt` with links to canonical public Markdown.
- [x] Review compliance; simplify for reuse, quality, and efficiency; resolve findings.
- [x] Check documentation links and compare independent repository discovery.
- [x] Run local bootstrap, typecheck, lint, unit coverage, full tests, integration selection, build, browser tests, demo driver, and release probes sequentially.
- [x] Confirm `/llms.txt` is served as text without auth or locale redirects.
- [x] Record verification and prepare the reviewed candidate for local integration.

Final handoff: commit the candidate, merge it locally into `develop`, then remove
the owned worktree/branch and temporary local services. The completion response
records the actual merge commit and cleanup result after those operations.

No remote push, CI trigger, or deployment is part of this authorization. Existing
GitHub workflows run on integration pushes; Vercel Git deployments are restricted
to `main` by `vercel.json`. All validation for this work is local.
