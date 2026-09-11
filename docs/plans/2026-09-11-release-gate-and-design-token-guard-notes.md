# Implementation notes for `2026-09-11-release-gate-and-design-token-guard`

## Deviations

### Phase 2: render states and categorical button styling

- **Plan said:** The confirmed case asserts the `GuestActions` primary button
  styling, and state and stamp assertions use roles or test IDs without copy.
- **Found:** Confirmed renders only the transparent request-change secondary
  action. The primary reconfirm-yes button exists only for
  `reconfirm_pending`, and `TodayHero`'s stamp has no stable role or test ID.
- **Chose:** Add a third `reconfirm_pending` fixture for the categorical
  primary-button computed-style assertions, and add
  `data-testid="today-hero-stamp"` to `TodayHero` and
  `data-testid="guest-primary-panel"` to `GuestShell` while retaining
  confirmed and cancelled coverage.
- **Why:** This exercises the exact v1.3.0 fill and contrast failure and keeps
  state and panel assertions translation-safe without exact colours, snapshots,
  or brittle DOM and CSS selectors.

### Phase 1: stable pulse locator

- **Plan said:** Assert the run-status pulse's computed background colour from
  the new browser spec without changing `RunStatusPoller`.
- **Found:** The pulse had no stable hook, so the spec had to select any
  `aria-hidden` span inside the card and would become ambiguous if another
  decorative span were added.
- **Chose:** Add `data-testid="run-status-pulse"` to the pulse and select that
  element directly in the computed-style assertion.
- **Why:** The regression test continues to assert colour versus transparency
  in a real browser while remaining independent of unrelated decorative markup.

### Phase 3: executable workflow and two-stage production proof

- **Plan said:** The product owner manually creates an environment and secrets;
  a job summary warns the reviewer before approval; the workflow installs
  dependencies and immediately runs the demo and probes; the same phase records
  the passing run URL and retires the historical follow-up.
- **Found:** GitHub exposes environment, reviewer, branch-policy, and secret
  setup through its CLI and API. Environment approval happens before any runner
  step can write a job summary. A fresh runner has no Playwright Chromium binary.
  The workflow must exist on default branch `develop` before manual dispatch is
  available, but its exact `main` environment restriction means the first live
  run must wait until the workflow is promoted to `main`. Recording that later
  run URL therefore requires a second documentation change.
- **Chose:** Put the reset warning in the dispatch input and run name, validate
  the acknowledgement and exact candidate against the selected `main` ref and
  live health identity before checkout, then revalidate the healthy live identity
  immediately before the secret-bearing demo starts. Pin every action to its
  reviewed upstream commit, install Chromium, serialize runs with a bounded
  timeout, and expose production secrets only to the sequential probe step. Keep
  environment creation and secret transfer behind separate external
  authorization, and keep the run URL and historical follow-up pending until the
  workflow reaches `main` and passes.
- **Why:** This preserves the required reviewer gate and least privilege, makes
  the workflow executable on a clean runner, refuses a stale or different
  production candidate at both trust boundaries, removes mutable action tags
  from the production credential path, and records only production evidence that
  actually exists.

### Release proof: AgentCore queued-run lifetime

- **Plan said:** Prove the dispatched production workflow with the existing
  production execution path.
- **Found:** The first production runs exposed two defects outside the planned
  workflow and design-token files. The AgentCore handler returned after accepting
  a queued run while execution was still active, and operational leases used the
  demo household clock. A demo clock jump could therefore reclaim a live worker.
- **Chose:** Keep the AgentCore invocation open until queued execution settles,
  and use database wall time for queue claims, heartbeats, deadlines, and
  stale-run recovery. Keep the household clock for domain behavior. Add a
  regression test that advances the demo clock while a gated run remains active.
- **Why:** The protected workflow could not pass reliably while its own guided
  clock advances could terminate or reclaim an active production run.

### Release proof: web database pool mode

- **Plan said:** Store the existing production web database URL in the protected
  workflow environment so the runner can execute the demo and probes.
- **Found:** Production reached the session pooler's login client cap during the
  release run. The existing runbook also incorrectly stated that Vercel should
  remain on session mode.
- **Chose:** Rotate the `layalga_web` credential, move both Vercel and the
  protected workflow secret to the transaction pooler, synchronize the ignored
  local environment and 1Password document, and correct the runbook.
- **Why:** Vercel function concurrency and the probe runner need short-lived
  pooled connections without exhausting the session-mode login limit.
