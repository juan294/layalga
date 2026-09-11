# Phase 3 — Production probe gate as a dispatched workflow `[batch-eligible]`

Parent: [plan](../2026-09-11-release-gate-and-design-token-guard.md)

Makes the nine-probe gate runnable against production without the secret ever
entering a local shell, retiring a follow-up that is now three releases old.

## Files

| File | Action |
| --- | --- |
| `.github/workflows/production-probes.yml` | new |
| `docs/release/e2e-pro-playbook.md` | edit |

No overlap with phases 1 or 2.

## Step 0 — Product owner action (blocking, cannot be scripted)

This phase is not complete until these exist. Create, in repository settings:

- An environment named `production-probes`, with the product owner as a
  **required reviewer**, and its deployment branches restricted to `main`.
- Four secrets **scoped to that environment**, not to the repository:

  | Secret | Value source |
  | --- | --- |
  | `PROD_DATABASE_URL` | the Vercel production `DATABASE_URL` (the non-owner `layalga_web` role) |
  | `PROD_LINK_TOKEN_SECRET` | Vercel production `LINK_TOKEN_SECRET` |
  | `PROD_AGENT_ROUTE_SECRET` | Vercel production `AGENT_ROUTE_SECRET` |
  | `PROD_TICK_SECRET` | Vercel production `TICK_SECRET` |

`LINK_TOKEN_SECRET` must match the deployment exactly — cleanup rewrites hashed
guest link tokens with it (`scripts/release-probes.ts:727-733`). A mismatch
leaves the demo guests' links unopenable.

These are the repository's first Actions secrets; nothing else in
`.github/workflows/` references any.

## Step 1 — The workflow

```yaml
name: Production probes
on:
  workflow_dispatch:
    inputs:
      commit:        # required, full 40-char sha of the deployed candidate
      acknowledge:   # required, must equal "RESET DEMO DATA"

permissions:
  contents: read     # match ci.yml:10-11; no write scopes

jobs:
  probes:
    runs-on: ubuntu-latest
    environment: production-probes    # the required-reviewer gate
    steps:
      - refuse unless inputs.acknowledge == "RESET DEMO DATA"
      - checkout at inputs.commit     # exact candidate, not the branch tip
      - pnpm/action-setup v11.22.0, setup-node 24   # mirror ci.yml:90-98
      - pnpm install --frozen-lockfile
      - run demo:e2e then release:probes
```

Probe step environment — note these come from `env:`, not flags, except
`--expect-runtime` which has no environment equivalent
(`scripts/release-helpers.ts:101-141`):

```
DATABASE_URL          <- secrets.PROD_DATABASE_URL
LINK_TOKEN_SECRET     <- secrets.PROD_LINK_TOKEN_SECRET
AGENT_ROUTE_SECRET    <- secrets.PROD_AGENT_ROUTE_SECRET
TICK_SECRET           <- secrets.PROD_TICK_SECRET
APP_URL               = https://layalga.thecreativetoken.com
EXPECTED_COMMIT_SHA   = inputs.commit
EMAIL                 = ses            # turns on the host-ping assertion
MEMORY                = agentcore      # turns on the search_memory assertion

pnpm run demo:e2e     -- --base https://layalga.thecreativetoken.com
pnpm run release:probes -- --base https://layalga.thecreativetoken.com \
                           --expect-runtime agentcore
```

No Supabase service and no `supabase start` — unlike the `acceptance` job
(`ci.yml:99-118`), this targets the production database directly.

Do **not** add `schedule:` or any push trigger. Manual dispatch only.

### Blast radius, stated in the workflow

Put this in the job summary so a dispatcher sees it before approving:

> This run resets the synthetic demo home and rotates its guest link tokens.
> It cannot touch real household data: the reset matches on exact id **and**
> exact name **and** `demo = true` (`src/lib/demo/reset.ts:190-195`).

## Step 2 — Playbook

In `docs/release/e2e-pro-playbook.md`:

- Release procedure step 9: name this workflow as how the probes are run for a
  production candidate, replacing the local invocation that has not been
  executable for three releases.
- Add the dispatch inputs and the four environment secrets to the executable
  verification section, alongside the existing local commands (which stay valid
  for a local target).
- Retire the standing follow-up once a real dispatched run has passed, and
  record that run's URL.

## Step 3 — Prove it

The workflow is unproven until it runs. Dispatch it once against the current
production commit and read the result.

Expect one of the known non-defect outcomes the playbook already documents, and
classify rather than assuming a candidate defect:

- An AgentCore cold start absorbed by the probe's own re-drain
  (`scripts/release-probes.ts:568-618`).
- A run-claim collision if probes are fired in rapid succession against the same
  demo home — the v1.2.0 diagnosis. Space the runs out.

Use the playbook's recovery vocabulary: a transient CLI or provider-observer
failure is `PAUSED`, never `BLOCKED`.

## Success criteria

**Automated**

- The workflow file is valid and appears under the repository's Actions tab.
- `bash scripts/verify-bootstrap.sh` passes; CI green on the PR.

**Manual**

- Environment, required reviewer, branch restriction, and the four
  environment-scoped secrets exist.
- One dispatched run against the live production commit completes with all nine
  probes passing and cleanup verified by the script's own assertion.
- That run's URL recorded in the playbook, and the three-release follow-up
  struck from the historical decisions.
