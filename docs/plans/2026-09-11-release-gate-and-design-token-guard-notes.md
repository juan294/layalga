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
  `data-testid="today-hero-stamp"` to `TodayHero` while retaining confirmed and
  cancelled coverage.
- **Why:** This exercises the exact v1.3.0 fill and contrast failure and keeps
  state assertions translation-safe without exact colours, snapshots, or
  brittle DOM and CSS selectors.

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
