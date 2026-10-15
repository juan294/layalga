# L’Ayalga Release Verification Playbook

## Status

Releases from v0.4.0 through v1.3.11 used the retired demo-based gate: a browser demo driver and nine probes that reset and drove the shared synthetic demo home. v1.3.2 (main `90b6838`, 2026-09-11) is the last release that passed that gate in full, on AgentCore runtime version 30. The historical decisions below record each release and the evidence that substituted when the full gate could not run.

The real-use launch replaces that gate. Demo mode, the demo seed and the demo API routes are removed, so every probe now runs on fixture households that the probe creates and deletes. One probe script serves local CI and production, and `--target` selects the probe set. The new production gate first ran for v2.0.0 (real-use release 1) on 2026-10-15 and passed. No command in this playbook grants deployment, rollback, tag, publication, DNS, AWS, or GitHub mutation authority; each release obtains them at the named gates.

Guest email delivery remains unactivated and follows [its readiness runbook](guest-email-readiness.md). Merging to develop does not apply migrations, IAM or deployments; merging to `main` deploys the web app immediately. No feature/develop Vercel preview deployments are allowed.

## Project adaptation profile

| Area                           | Project value                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Project                        | L’Ayalga                                                                                                                              |
| Intended repository visibility | Public                                                                                                                                |
| Product type                   | Web application with an agent runtime                                                                                                 |
| Package and build system       | pnpm 11 and Next.js 16                                                                                                                |
| Integration branch             | `develop`                                                                                                                             |
| Production branch              | `main`; promoted from `develop` by pull request                                                                                       |
| Merge strategy                 | Squash pull requests                                                                                                                  |
| Release artifact               | Exact Git commit plus matching web and agent deployments                                                                              |
| Web deployment                 | Vercel production from `main`, deployed automatically on merge                                                                        |
| Agent deployment               | AgentCore runtime `layalga_agent-mONXXjFms4`, bundle deployed per release by `scripts/deploy-agentcore.sh`                            |
| Local target                   | Application, local Supabase, real local Supabase sessions on fixture households, and the scripted test model                          |
| Preview target                 | Disabled for feature/develop branches; no preview deployments                                                                         |
| Staging target                 | None                                                                                                                                  |
| Production target              | `https://layalga.thecreativetoken.com`; production probe target on two fixture households                                             |
| Tests                          | Vitest, local Supabase integration tests, Playwright, and the local release probe target                                              |
| Primary datastore              | PostgreSQL through Supabase                                                                                                           |
| Queue and scheduler            | Durable PostgreSQL run queue and jobs; `after()` dispatch plus Vercel Cron recovery                                                   |
| Authentication                 | Google hosts admitted by `host_identity_claims`, invitation links, and optional guest claims                                          |
| Notifications                  | In-app reminders and host SES pings; consented guest email implemented, production activation pending. SES acceptance is not delivery |
| Other vendors                  | Strands on Bedrock through AgentCore; production model is Sonnet 4.6. Tests and the local probe target use the scripted model         |
| Release approver               | Product owner                                                                                                                         |
| Rollback authority             | Product owner                                                                                                                         |

## Environment truth

| Environment | Exact artifact? | Real auth? | Real datastore? | Real vendors? | Safe writes? | Limitation                                                                                                                                                                                                                   |
| ----------- | --------------: | ---------: | --------------: | ------------: | -----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local       |              No |    Partial |             Yes |            No |          Yes | Google OAuth works locally with a claim row; normal evidence uses local Supabase email sessions (`signInAsHost`) and `MODEL=scripted`                                                                                        |
| CI          |             Yes |    Partial |             Yes |            No |          Yes | Exact checkout with ephemeral Supabase and local Supabase email sessions; no Google or vendor calls                                                                                                                          |
| Preview     |              No |         No |             Yes |            No | Not verified | Preview deployment is disabled; no preview evidence is claimed                                                                                                                                                               |
| Staging     |             N/A |        N/A |             N/A |           N/A |          N/A | No staging environment planned                                                                                                                                                                                               |
| Production  |             Yes |         No |             Yes |       Partial |          Yes | The production probe target binds the exact commit and runs on fixture households through the internal agent route; Bedrock, AgentCore and memory recall are exercised; Google host sign-in and guest inbox delivery are not |

## Adopted scope

Wave A is mandatory once the application has a release candidate. It must enforce:

- At least one required check passed. Zero-pass runs fail.
- Every required failure or skip blocks release.
- Required checks cannot be excused by quarantine.
- Evidence names one fixed candidate commit.
- Web and agent deployment identities match that candidate.
- Fixture household cleanup is verified.
- The product owner explicitly authorizes deployment and publication.
- The release tag is the final action.

Wave B exploratory charters are applicable after the first deployed candidate and remain separate Class D work. Waves C through H stay deferred unless a named change in risk justifies promotion; historical production verification does not make every deferred wave mandatory.

## Release probes

`scripts/release-probes.ts` runs the probes for one target in order. Each run builds two fixture households from the shared builder (`src/test-support/fixture-household.ts`): `Release probe <run id>` with three rooms, and `Release probe conflict <run id>` with one contested room for the concurrency probe. Probes enqueue work through `POST /api/agent/run` with the `x-layalga-internal` header and drain it through `GET /api/ticks`. No probe uses a browser session or touches a real household.

| Probe                 | Local | Production | Assertion                                                                                                                                       |
| --------------------- | :---: | :--------: | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `health`              |  yes  |    yes     | `/api/health` is `ok`; for a non-local base, the reported commit equals the candidate                                                           |
| `host-capture`        |  yes  |    yes     | A `host_capture` run for the fixture host completes and creates one tagged tentative invitation; optional runtime and memory assertions (below) |
| `guest-confirmation`  |  yes  |    yes     | A `guest_submit` run on the captured invitation creates one hold and one confirmation audit                                                     |
| `concurrent-conflict` |  yes  |    yes     | Two concurrent holds on the one contested room: exactly one wins and the other is rejected safely                                               |
| `interrupt-resume`    |  yes  |     no     | A policy-triggering request pauses; a recorded host approval resumes it through a new queued run and applies once                               |
| `reconfirmation`      |  yes  |     no     | A past-due reconfirmation job for a fixture visit is dispatched by the tick, with the expected notification and status                          |
| `room-coordination`   |  yes  |     no     | The selected rooms equal the fixture household's rooms                                                                                          |
| `guest-isolation`     |  yes  |    yes     | An invalid guest token page shows the invalid state and no fixture party name                                                                   |
| `cleanup`             |  yes  |    yes     | Both fixture households and their tagged artifacts are deleted, and no rows remain                                                              |

Cleanup runs in `finally`, also after a failed probe. A run ends in one of three states:

- `passed`: every probe for the target passed and cleanup verified zero remaining rows.
- `PAUSED`: the environment failed (unreachable base, gateway status, dropped database connection, run timeout). The candidate is not disproved; repair the environment and run the same candidate again.
- `BLOCKED`: an assertion failed on a completed run. The candidate needs a fix.

On any failure the script exits with status 1 and prints the run ID and `pnpm run release:probes -- --cleanup-only <run id>`. That command deletes both fixture households of the run and their tagged artifacts, then exits. Use it when a run stops before its own cleanup finishes.

Options:

- `--target local|production` selects the probe set (default `local`).
- `--base <url>` selects the application (default `APP_URL`, then `http://127.0.0.1:3008`).
- `--commit <sha>`, or `EXPECTED_COMMIT_SHA`, is the candidate identity. A non-local base without it fails.
- `--expect-runtime local|agentcore` asserts `executedOn` on the capture run and, locally, on the resume run.
- `--expect-memory`, or `MEMORY=agentcore` in the probe environment, asserts a `search_memory` audit row on the capture run.
- `--cleanup-only <run id>` only removes a run's fixture households.

Omitting an assertion does not prove that the behavior did not happen; it only skips the assertion. The probes need `DATABASE_URL`, `LINK_TOKEN_SECRET`, `AGENT_ROUTE_SECRET` and `TICK_SECRET` for the target. Each probe re-drains the queue every 15 seconds for up to 90 seconds to absorb an AgentCore cold start, then polls the exact run IDs to a terminal state and checks the database. The probe output does not print private guest-link tokens.

## Executable local verification

Start the local database with `pnpm run db:start` and reset it with `pnpm run db:reset`. Retrieve its local API URL and publishable key with `pnpm exec supabase status`; use the publishable key from that local stack, never a hosted project key. Replace the key placeholder below in each terminal. These explicit exports override any `.env.local` values Next.js loads. Email, memory, external scheduling and tracing are disabled for this local evidence path.

Start the application with the local runtime and scripted model in one terminal:

```bash
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54621
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='<publishable key from local supabase status>'
export LINK_TOKEN_SECRET=e2e-link-token-secret-at-least-32-bytes
export CALENDAR_FEED_SECRET=e2e-calendar-feed-secret-at-least-32-bytes
export TICK_SECRET=e2e-tick-secret-at-least-32-bytes
export AGENT_ROUTE_SECRET=e2e-agent-route-secret-at-least-32-bytes
export CRON_SECRET=e2e-cron-secret-at-least-32-bytes
export APP_URL=http://127.0.0.1:3008
export AGENT_RUNTIME=local
export MODEL=scripted
export SCHEDULER=none
export EMAIL=none
export MEMORY=none
export OTEL_SDK_DISABLED=true
export AWS_EC2_METADATA_DISABLED=true
export AGENT_EXECUTION_RUNTIME=
unset NODE_OPTIONS
pnpm run dev
```

Run the browser tests and the local probe target from another terminal with the same exports:

```bash
pnpm run test:e2e
pnpm run release:probes -- --target local --base http://127.0.0.1:3008
```

The CI `acceptance` job runs the same two commands against an exact checkout and an ephemeral Supabase stack.

## Production gate

The production gate is the manually dispatched `Production probes` workflow (`.github/workflows/production-probes.yml`). It runs `release:probes --target production --expect-runtime agentcore` against `https://layalga.thecreativetoken.com` with `MEMORY=agentcore`, so the memory assertion applies. The `production-probes` environment must have the product owner as a required reviewer and an exact `main` deployment-branch policy. It holds these environment-scoped secrets:

| Secret                    | Exact source                                                          |
| ------------------------- | --------------------------------------------------------------------- |
| `PROD_DATABASE_URL`       | Vercel production `DATABASE_URL` for the non-owner `layalga_web` role |
| `PROD_LINK_TOKEN_SECRET`  | Vercel production `LINK_TOKEN_SECRET`                                 |
| `PROD_AGENT_ROUTE_SECRET` | Vercel production `AGENT_ROUTE_SECRET`                                |
| `PROD_TICK_SECRET`        | Vercel production `TICK_SECRET`                                       |

Rotate the matching environment secret whenever one of those Vercel production values rotates. An outdated `PROD_LINK_TOKEN_SECRET` makes the fixture guest-link hashes differ from what the deployed application expects, and an outdated route or tick secret makes the probes fail authentication.

Dispatch the workflow from `main` with two inputs:

- `commit`: the full 40-character SHA reported by the production health route.
- `acknowledge`: the exact value `WRITE PROBE FIXTURE`.

The acknowledgement states the blast radius before the required-reviewer decision: the run creates two fixture households, `Release probe <run id>` and `Release probe conflict <run id>`, and deletes them. It never reads or writes the real household, because every probe row lives under the fixture homes and cleanup deletes by exact ID and name. The workflow validates the acknowledgement, the full SHA, the selected `main` ref, and the live production identity before it checks out or executes candidate code. It checks the healthy live identity again immediately before the probe step, which is the only step that receives the four production secrets. It installs no browser.

```bash
gh workflow run production-probes.yml \
  --ref main \
  -f commit=<candidate-sha> \
  -f acknowledge='WRITE PROBE FIXTURE'
```

If a run stops before cleanup, its log prints the run ID. `--cleanup-only` needs only the production `DATABASE_URL`. Running it from a workstation is a production write and needs owner authorization:

```bash
pnpm run release:probes -- --cleanup-only <run id>
```

Read a failed run's state before acting. `PAUSED` allows the same candidate to be dispatched again after the environment is repaired. `BLOCKED` needs a fixed candidate. The production `guest-confirmation` probe has so far run only against the scripted model; if Bedrock returns an `interrupted` result, examine the run before treating it as a candidate defect (review note P2-R6 in the [implementation notes](../plans/2026-10-15-real-use-launch-notes.md)).

Open owner decision P2-R1: each production run writes AgentCore Memory events for its fixture parties. Database cleanup deletes the parties, but the long-term memory records extracted under `/parties/home-<fixture home>/party-<id>` remain; raw events expire after 30 days. About four actors accrue per run. They are scoped to the fixture homes, so the real household does not read them. The options are to accept them and forget probe actors periodically, to grant the workflow a narrow AWS role that forgets fixture parties before cleanup, or to run the production gate without the memory assertion. The decision is open; until it is taken, each production run adds these records.

### Production workflow release-system impact

- **Risk class (A/B/C/D/E):** A for `host-capture`, `guest-confirmation`, `concurrent-conflict` and `guest-isolation`, each of which stops a candidate that breaks a core journey or exposes a guest. B for `health` (exact identity) and `cleanup` (recovery).
- **Unique production risk prevented:** The production gate is the only layer that runs the candidate against AgentCore, Bedrock and the production database roles. A candidate cannot be published after only local scripted-runtime coverage, and the evidence cannot silently describe a commit different from the live web deployment and the selected `main` candidate.
- **Existing controls that already cover part of this risk:** Pull-request CI runs Playwright and all nine local-target probes against an exact checkout, ephemeral Supabase, the local agent runtime and the scripted model. The interrupt-resume, reconfirmation and room-coordination probes stay in that local lane and in integration tests.
- **Why this must be synchronous (if Class A/B):** Wave A requires it after both production targets deploy and before tag publication. Earlier production runs rejected real candidates for model and timeout defects that local CI could not observe.
- **Added local critical-path time:** None.
- **Added remote critical-path time / workflows / deployments:** One manually dispatched job per production candidate, with no added deployment. It is shorter than the retired gate, which drove a browser through the demo for about 8 minutes per run. The job has a 30-minute hard timeout; record the first measured duration before claiming a budget.
- **Added external dependencies:** None beyond the retired gate. The workflow no longer needs Chromium.
- **Added evidence objects:** One Actions run URL with immutable workflow inputs, logs, job summary and the probe report, including the cleanup assertion.
- **Same-candidate recovery behavior if this gate fails:** `PAUSED` resumes the same candidate after repair. A reproduced candidate defect after promotion requires `ROLLED_BACK` and a new candidate. A successful production proof whose tag or documentation update remains is `PUBLICATION_PENDING` and must not redeploy.
- **Control this replaces or consolidates, if any:** It replaces the nine-probe gate and the `demo:e2e` browser driver in `production-probes.yml`.

## Database runtime readiness

Follow [the runtime database and identity runbook](runtime-database-and-identity.md) to set unique passwords for `layalga_web` and `layalga_agent`, configure each deployment with its service-specific non-owner `DATABASE_URL`, and verify grants with `current_user`. A production URL that starts with the database owner is a release blocker.

The queue recovers expired run leases and permits bounded attempts. Scheduled jobs retry after one minute and five minutes. A third failure changes the job to `quarantined`; inspect and replay it with the same runbook. Do not replay queued or running work.

## Release procedure

1. Obtain explicit release authorization.
2. Confirm a clean worktree and the documented branch topology.
3. Fix one candidate commit and record it in the release evidence.
4. Run typecheck, lint, targeted tests, full tests, integration tests, browser tests, the local probe target and build sequentially.
5. Stop if no required check passed or any required check failed or skipped.
6. Apply the candidate migrations (`supabase db push --linked`) and verify the separate runtime database roles. Do this before merging the release pull request into `main`: the merge itself deploys the web app, and a web candidate that starts before its migrations runs new code against the old schema (this happened for about four minutes during the v1.0.0 candidate 1 deploy).
7. Deploy the exact candidate to both authorized production targets: merge to `main` for the Vercel web deployment, and build the AgentCore runtime bundle from the same commit with `scripts/deploy-agentcore.sh --profile archy`. A candidate whose agent bundle lags the web deployment is not one candidate. If branch protection reports the pull request head as not up to date, run `gh pr update-branch <number>` so GitHub merges `main` into `develop`, then wait for the checks again.
8. Verify the deployed identity against the candidate.
9. Dispatch the `Production probes` workflow from `main` for the exact deployed candidate with `WRITE PROBE FIXTURE`, approve its `production-probes` environment gate, and require every production probe, including cleanup, to pass.
10. Verify the datastore state, queue completion and that no fixture household remains.
11. Present complete evidence and residual risk to the product owner.
12. Obtain separate tag and publication authorization.
13. Create and push the named tag last through `/release`.

## Real-use launch releases

The real-use launch ([plan](../plans/2026-10-15-real-use-launch.md)) removes demo mode in two releases. Schema removal needs two steps because migrations run before the web deploy and AgentCore deploys separately: dropping `homes.demo` while the old web app or the old AgentCore bundle still reads it would break live requests. Release 1 shipped as v2.0.0 on 2026-10-15. Release 2 has not run. Every production action in it needs explicit owner authorization at the time it runs.

Release 1 (expand) follows the release procedure above, with these additional actions ([phase 5](../plans/2026-10-15-real-use-launch-phases/phase-5.md)):

- Read-only preflight: repeat the household counts. Any visit, or any home other than `…0001`, stops the release and goes to the owner.
- Confirm that the Google OAuth client is published "In production" and lists the Supabase callback URI.
- Disable the email provider in hosted Supabase Auth, keep Google enabled, and check that `/auth/v1/settings` reports `email: false` and `google: true`.
- Remove `DEMO_MODE` and `DEMO_SESSION_SECRET` from Vercel production. Vercel applies the change only to a new deployment: until the merge deploys, the old build still reads `DEMO_MODE=true`. After the conversion it finds no demo home and shows neither Google sign-in nor demo entry, so merge directly after `db push`, or redeploy the current build after the env change as a separate authorized action.
- Run `pnpm run forget-synthetic-memory` against the production AgentCore Memory store to remove the synthetic Vega and Parker records.
- Apply the conversion migration with `supabase db push --linked` before the merge. Home `…0001` then has `demo = false`, no parties, invitations or rooms, two hosts and two claims.
- After the deploy and the production gate, the owner signs in with Google and reaches the empty household dashboard.

Release 2 (contract) starts only after release 1's AgentCore runtime version is recorded ([phase 6](../plans/2026-10-15-real-use-launch-phases/phase-6.md)). A preflight script refuses to continue unless the deployed runtime version matches that record. The contract migration fails while any home has `demo = true`. It redefines the retention function without its demo predicates and drops `homes.demo`, `demo_clock`, the demo mutation tables, `review_access_events` and `private.restore_demo_identity_claims()`. Release 2 then follows the normal procedure and production gate.

## Real-use release decisions

RELEASED. v2.0.0, real-use release 1, shipped 2026-10-15 on its first candidate, main `e0cb4d1242c777b92a0e3a841081960b174afdbd` (pull request #201). `main` was already an ancestor of `develop`, so no reconciliation merge was needed. The release pull request passed CI, CodeQL, coverage and dependency review. The read-only preflight found one home (`…0001`, `demo = true`), 2 parties, 2 invitations, 0 visits, 0 runs, 3 rooms, 2 hosts and 2 claims. Hosted Supabase Auth reports `email: false` and `google: true`. `DEMO_MODE` and `DEMO_SESSION_SECRET` are removed from Vercel production; their Preview copies remain, and Preview deployments stay disabled. Migration `20261015082739_convert_household_to_real_use.sql` was applied directly before the merge; home `…0001` then had `demo = false`, 0 parties, invitations and rooms, 2 hosts and 2 claims. `/api/health` reported the candidate with status `ok` and no stale work. AgentCore runtime `layalga_agent-mONXXjFms4` moved from version 37 (S3 object version `aGkoYkHAMOcWbZ.k7Mbmz24D9oiVVmQt`) to version 38 (S3 object version `rqpNEq_vsxcXiIUd7dFWpnzahz7P0Yz1`), built from a clean detached checkout of the candidate. The [production probe run](https://github.com/juan294/layalga/actions/runs/38724687108) passed all six production probes, including cleanup; a later read showed 1 home, 0 runs and 0 visits. The live sign-in page shows only the Google button, `/en/demo-enter` returns 404, and the owner signed in with Google and reached the host dashboard of home `…0001` with an empty room ledger and the add-room form.

The synthetic memory forget (`pnpm run forget-synthetic-memory`) first hit the operating environment's permission classifier; after the owner granted the permission it ran later the same day and removed 36 memory records for Familia Vega and 0 for The Parkers, with 0 raw events for either. A follow-up listing showed no records under either party namespace, and both `memory_forgotten` audit rows exist. One release-1 item stays open: the Google OAuth app is still in publishing status "Testing" with no test users, and its redirect URI is correct. The owner's sign-in worked; whether the second host can sign in before the app is published or the host is added as a test user is unverified.

## Historical release decision

These decisions describe releases made with the retired demo-based gate. They name the demo driver, the demo home and the nine probes as they existed at the time.

RELEASED. v1.0.0 passed every gate on 2026-09-05 on the second candidate: CI green, both deployment identities on `0f1fcf2` (web on Vercel, AgentCore runtime version 21), migrations `20260905000100` through `20260905000700` applied during candidate 1, nine production probes passed with `--expect-runtime agentcore --expect-email --expect-memory`, cleanup verified, tag pushed last. Candidate 1 (`2641297`) was rejected by probe 2 for two Sonnet 4.6 behaviors found in CloudWatch traces: the model dropped the probe tag when restating the host message into `capture_invitation`, which broke the probe's `raw_message` matching, and it called `capture_invitation` again after a success, creating duplicate invitations. The harness now identifies invitations through the run payload and the capture audit row, and the tool reuses the run's existing invitation; both fixes shipped on `develop` before candidate 2. Full evidence: `docs/agents/release-v1.0.0-report.md` (local, gitignored).

RELEASED, product-owner-approved with partial automated verification. v1.1.0 shipped 2026-09-09 on candidate `4e2d733` (web on Vercel, AgentCore runtime version 23): CI green, no pending migrations, no schema changes this cycle. Release verification surfaced a real defect: `RunStatusPoller` compared the server's `runs.deadline_at` (derived from a demo home's simulated clock) against the browser's real `Date.now()`, so the client stopped polling before ever checking status even though the run was completing correctly on the backend -- this was blocking the room-coordination probe (probe 7) specifically. The fix (clock-agnostic deadline duration, applied relative to the client's own polling start time) shipped as a same-day follow-up candidate from `4e2d733`, redeployed to both targets, and was independently confirmed via CloudWatch, direct database inspection, and live browser testing against production for both the room-request and capture-invitation flows the original bug blocked.

A full clean nine-probe automated run was not completed for this release. After the poller fix, repeated `release:probes` runs against production surfaced different, non-reproducible outcomes each time (a capture-invitation timeout, a concurrency-assertion mismatch in code untouched by this release, one run where cleanup itself errored after all nine probes apparently passed) -- a pattern consistent with live-Bedrock latency variance, plausibly worsened by roughly ten rapid-fire verification runs against the same production environment inside 40 minutes, rather than a reproduced code defect. Synthetic-data cleanliness was verified directly (`runs`, `visits`, `pending_decisions` all zero; `homes` count unchanged at one; `invitations` at the expected seeded baseline of two) rather than through the probe script's own cleanup assertion. The product owner reviewed this evidence and explicitly authorized proceeding to tag and publish without a clean automated nine-probe run. Follow-up: re-run the full probe suite with natural spacing once the environment has been idle, to confirm this release still passes the complete automated gate.

RELEASED. v1.2.0 shipped 2026-09-09 on its first candidate, main `0545ac0c27efd108dd279130a03f7b79d4a53b41`: CI green, no pending migrations, no schema changes this cycle. Both deployment identities matched the candidate (web verified via `/api/health`; AgentCore runtime `layalga_agent-mONXXjFms4` version 24, S3 object `IPMCUXh_oWZILzGSGdAtMQPudOobOSNc`). The follow-up to v1.1.0's own unresolved action item: an initial `release:probes` run hit repeated timeouts on the interrupt-and-resume scenario, diagnosed (not just suspected) from CloudWatch logs and `src/agent/run-task.ts` source: `claimQueuedRun` only reclaims a `running` row after 6 minutes of staleness, and firing `demo:e2e` twice then `release:probes` in rapid succession against the same fixed canonical demo home made each attempt collide with the previous one's still-valid claim. This is a self-inflicted testing-cadence artifact, not a candidate defect. A single patient re-run after a short cooldown passed all nine probes cleanly, including probe 5 (interrupt and resume) and probe 2 with a memory search on the capture run. Cleanup verified through the probe script's own assertion this time (`runs`/`visits`/`pending_decisions` zero, `homes`/`invitations` at baseline). No code change was required. Full addendum: [ADR 0002](../decisions/0002-agent-runtime.md#release-addendum-2026-09-09-v120).

RELEASED, product-owner-approved with partial automated verification. v1.2.1 shipped 2026-09-09 on its first candidate, main `e1ddc1beb072cb14372c94c600088151c2980b93`: CI green, no pending migrations, no schema changes this cycle -- a UI-only fix (host sign-out button contrast; a missing sign-out control added to the cookie-backed guest session page). Both deployment identities matched the candidate (web verified via `/api/health`; AgentCore runtime `layalga_agent-mONXXjFms4` version 25, S3 object `CDj311rUEPJnZw_iWn2RZbsyXAi.LOqC`). Before this candidate reached `main`, `develop` and `main` needed a real two-parent reconciliation merge (this project's recurring squash-merge-workflow artifact, also seen before v1.0.0, v1.0.0-candidate-2, and v1.1.0): the squash-only PR merge strategy never makes `main` an actual git ancestor of `develop`, so `gh pr merge` and `gh pr update-branch` both reported unresolvable conflicts on `CHANGELOG.md` and `package.json` despite `develop`'s content being a strict superset of `main`'s. The reconciliation merge commit was pushed directly to `develop`, bypassing the local guard hook that blocks direct pushes to `develop`/`main`, at the user's explicit direction and by the user's own hand.

The automated `demo:e2e` plus nine-probe `release:probes` run against production did not happen this cycle: the operating environment's permission classifier blocked exporting the production `DATABASE_URL` (pulled via `vercel env pull`) into the shell that would run the scripts, judging that action too sensitive to execute autonomously. Given the change's narrow, UI-only, schema-neutral scope, the product owner explicitly chose to skip the full probe run rather than run it by another path. In its place: `/api/health` was polled until it reported the candidate commit with `status: ok` and zero stale runs/jobs; and both fixed surfaces were exercised directly against production through a real browser session (demo host and demo guest sign-in) -- the host dashboard's sign-out button renders as the intended solid, legible control and successfully signs out; the guest session page now shows a "Sign out" control that also successfully signs out. Neither check touches the booking/agent/memory/notification paths the nine probes cover, none of which this release's diff touches either. Follow-up: re-run the full probe suite from an environment that can hold the production `DATABASE_URL`, to confirm this release still passes the complete automated gate.

RELEASED, product-owner-approved with partial automated verification. v1.3.0 shipped 2026-09-10 on its first candidate, main `02dbb3560889a0921292ec5f905d7e98013dfbf1`: CI green (the acceptance job failed once on the release-prep PR with `HEALTH_OPERATIONS_DEGRADED`/`staleRuns: 1` for the full readiness-wait window before the demo/probes step ever ran; a re-run of just that job passed cleanly with the identical, unchanged candidate diff -- a shared-database artifact between that job's own "Run browser tests" and "Run demo and release probes" steps, not a candidate defect), no pending migrations, no schema changes this cycle -- a UI-only design change (signed-in shell unification: sign-out moved into the shared site header, both guest routes restructured onto the host page's seasonal-hero and panel-grid composition). Both deployment identities matched the candidate (web verified via `/api/health`; AgentCore runtime `layalga_agent-mONXXjFms4` version 26, S3 object `nLD4T019OppY98bHzNQcmcRg0ksVt4ZF`). Before this candidate reached `main`, `develop` and `main` again needed the recurring two-parent reconciliation merge (same squash-merge-workflow artifact as v1.0.0, v1.0.0-candidate-2, v1.1.0, and v1.2.1). This time the agent verified `develop`'s content was a strict superset of `main`'s, built the merge commit locally with every conflict resolved in `develop`'s favor (`-X ours`), caught and removed one non-conflicting hunk that silently reintroduced a translation key already deleted on `develop` (`git diff` against the pre-merge tree came back empty only after that fix), and asked the product owner how to proceed given the local guard hook has no bypass flag for a direct push to `develop`; the owner chose to have the agent prepare the commit and ran the final `git push origin develop` themselves.

The automated `demo:e2e` plus nine-probe `release:probes` run against production did not happen this cycle either: `vercel env pull --environment=production` succeeded (unlike v1.2.1, where the pull itself was blocked), but the operating environment's permission classifier blocked reading the pulled `DATABASE_URL` value, judging that too sensitive to inspect autonomously -- the same class of block as v1.2.1, at a different point in the same operation. In its place: `/api/health` was polled until it reported the candidate commit with `status: ok` and zero stale runs/jobs; `pnpm run agent:smoke` was run against the newly deployed runtime using the AgentCore execution role's own `DATABASE_URL` from the local `.env.agentcore` file (distinct from the blocked web-role production URL) -- the opportunistic local dispatch failed with `AccessDeniedException` (expected: the smoke script ran with no AWS credentials exported for the Bedrock invoke call), but the queued run was correctly picked up by production's own Vercel Cron tick job and completed end-to-end on the real AgentCore v26 runtime, with its tagged synthetic data cleaned up by the script's own assertion; and both changed surfaces were exercised directly against production through a real browser session -- the host dashboard's sign-out button renders in the shared header and the Today hero no longer carries one, and the guest ledger page renders the new hero/panel-grid composition with working disclosure rows. None of this touches the booking-decision, concurrency, memory, or notification paths the nine probes cover, none of which this release's diff touches either. Follow-up: re-run the full probe suite from an environment that can hold the production web-role `DATABASE_URL`, to confirm this release still passes the complete automated gate.

RELEASED, product-owner-approved with partial automated verification. v1.3.1 shipped 2026-09-10 on its first candidate, main `de8da438d569e97da68c1826a2013fd60ef4e80f`: CI green on all three pull requests (#146 the fix, #147 release prep, #148 the promotion), no pending migrations, no schema changes this cycle -- a UI-only fix. Both deployment identities matched the candidate (web verified via `/api/health` with zero stale runs and jobs; AgentCore runtime `layalga_agent-mONXXjFms4` version 27, S3 object `6Ecf6avIS9zO1s.hbhjYhUeSdsd_G3KK`, built from a verified-clean checkout of the candidate).

This release fixed a defect that v1.3.0 shipped to production with every automated check green. `guest-ledger.module.css` declared its `--guest-*` design tokens only inside `.shell`, and v1.3.0's shell unification replaced that wrapper with `GuestShell`, which uses inline styles. Every rule reading those tokens then resolved to an invalid `var()` -- guaranteed-invalid in CSS, so each property silently fell back to its initial value: guest inputs lost their border and 44px height, the teal primary button rendered as bare text, body copy inherited ink instead of graphite, and the disclosure rows lost their separators. No stage of the pipeline renders a page, so nothing failed; the product owner found it by looking at the screen and comparing against the design handoff. The tokens now live on `:root`, where they still follow the season and the theme because every base-token override is on `<html>`. Process consequence: a design or UI change is not verified by a green pipeline, and the release evidence for one must include a real render of the changed surface.

Before this candidate reached `main`, `develop` and `main` needed the recurring two-parent reconciliation merge for the sixth time (v1.0.0, v1.0.0-candidate-2, v1.1.0, v1.2.1, v1.3.0, v1.3.1). The `-X ours` merge again applied a non-conflicting hunk from `main`, this time a duplicate `.cancellationToggle::before` block carrying the pre-fix teal marker colour that would have overridden the fix being released -- caught by diffing the merge result against the pre-merge `develop` tree, removed by restoring that tree and amending the merge, and re-verified empty. The agent prepared the commit and the product owner ran `git push origin develop`, the guard hook having no bypass flag.

The automated `demo:e2e` plus nine-probe `release:probes` run against production did not happen this cycle either -- the third consecutive release with this condition. `vercel env pull --environment=production` succeeded, but the operating environment's permission classifier blocked sourcing the pulled `DATABASE_URL` into the shell that would run the scripts (the same class of block as v1.2.1 and v1.3.0, at the same point as v1.3.0). Two attempts were made, one adjustment, then the attempt was abandoned rather than contorted around the control, and the pulled environment file was deleted. In its place: `/api/health` polled until it reported the candidate commit with `status: ok` and zero stale runs and jobs, re-checked clean after the smoke run; `pnpm run agent:smoke` run against the newly deployed runtime using the AgentCore execution role's own `DATABASE_URL` from the local `.env.agentcore` file, which completed end-to-end with `status: completed` and `executedOn: "agentcore"` -- a real run on v27, stronger than v1.3.0's smoke, which only completed via the production cron tick -- with its tagged synthetic data removed by the script's own cleanup assertion; and both the fixed guest ledger and the host overview exercised directly against production through a real browser session, confirming bordered 44px inputs, the teal primary button, matched panel headings, and ruled 52px disclosure rows. None of this touches the booking-decision, concurrency, memory, or notification paths the nine probes cover, none of which this release's diff touches either. Follow-up, now three releases old: re-run the full probe suite from an environment that can hold the production web-role `DATABASE_URL`.

RELEASED. v1.3.2 shipped 2026-09-11 on main `90b68385a590144d6d44cd7dd41298180b2d182c`. Vercel reported that exact commit with healthy configuration and zero stale runs or jobs. AgentCore runtime `layalga_agent-mONXXjFms4` version 30 used S3 object version `VaKvmW1EDGW4OEqhSXm_l6X6B4WR0_BB`, built from the same detached commit. No migrations were pending. Both runtime connections were verified as their separate non-owner `layalga_web` and `layalga_agent` roles with no superuser, role creation, database creation, replication, bypass-RLS, `auth` schema, or `public` schema creation authority.

The protected [production workflow run](https://github.com/juan294/layalga/actions/runs/34583050263) checked out the exact candidate, ran the guided demo, and passed all nine probes. Host capture and resume executed on AgentCore, capture searched AgentCore Memory, host SES outcomes matched, concurrent conflict and interrupt handling applied once, guest isolation held, and probe 9 restored the synthetic fixture. The final health check again showed zero stale or retrying work.

Two rejected candidates exposed one failure with two causes. AgentCore accepted queued execution but returned before model work finished, so the invocation could end while the promise continued locally. After keeping the invocation open, demo clock advances still caused stale-run recovery to reclaim the active worker because queue claims, heartbeats, and deadlines used household time. Runtime v30 keeps the invocation open through execution and uses database wall time for operational leases while preserving the demo clock for household behavior. The release also adds categorical computed-style browser assertions and a static custom-property guard so a visible colour cannot silently become transparent and a required width cannot silently become zero. The web database URL moved from the session pooler to transaction mode after production reached the session login's client cap; the rotated URL is synchronized across Vercel, the protected workflow secret, the local ignored environment file, and 1Password.

v0.5.0 passed every gate on 2026-09-04 on the third candidate: CI green, both deployment identities on `c4e3ac3` (web on Vercel, AgentCore runtime version 16), migration `20260904000100_host_email_pings.sql` applied ahead of the deploy, nine production probes passed with `--expect-runtime agentcore --expect-email --expect-memory`, cleanup verified, tag pushed last. The two earlier candidates were rejected by the probes for production-only findings (remembered facts overwriting captured invitation facts; a 30 s API timeout on the escalation tick), each fixed on develop before the next candidate. v0.4.0 passed the same gate earlier the same day on `0935fed`.

## Rollback

Rollback is a separate production mutation and requires explicit owner authorization.

Web rollback:

```bash
vercel rollback <previous-deployment>
curl --fail --silent --show-error \
  https://layalga.thecreativetoken.com/api/health
```

Production dispatch is `AGENT_RUNTIME=agentcore` (decided in [ADR 0002](../decisions/0002-agent-runtime.md)). The local-runtime rollback changes one dispatch flag; the web identity's model allowlist (`infra/iam/web-bedrock-policy.json`) includes Sonnet 4.5 and 4.6 since 2026-09-05, so verify only that `BEDROCK_MODEL_ID` in the Vercel environment is one of those two before flipping the flag; see the [runtime runbook](runtime-database-and-identity.md).

With compatible model authorization established, the dispatch change is:

```bash
vercel env rm AGENT_RUNTIME production
vercel env add AGENT_RUNTIME production   # value: local
vercel redeploy <current-prod-deployment> --target production
```

If instead the AgentCore artifact itself must roll back to a previous bundle, redeploy the runtime with the prior S3 object version and the same `--lifecycle-configuration` used by `scripts/deploy-agentcore.sh`:

```bash
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id <runtime-id> \
  --agent-runtime-artifact '{"codeConfiguration":{"code":{"s3":{"bucket":"<bucket>","prefix":"<key>","versionId":"<previous-version-id>"}},"runtime":"NODE_22","entryPoint":["app.js"]}}' \
  --role-arn <runtime-role-arn> \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --protocol-configuration '{"serverProtocol":"HTTP"}' \
  --lifecycle-configuration '{"idleRuntimeSessionTimeout":300,"maxLifetime":1800}' \
  --profile archy \
  --region us-east-1
```

`scripts/deploy-agentcore.sh --profile archy --s3-version-id <previous-version-id>` performs the same rollback without hand-building the artifact and lifecycle JSON, reusing the runtime env already in `.env.agentcore`. Record the target `versionId` from [ADR 0002](../decisions/0002-agent-runtime.md)'s per-release addenda before rolling back; each release records the prior bundle's S3 object version there.

After either rollback, verify restored identity before any other probe. Then run the production probe target, preferably through the `Production probes` workflow; a direct run needs the four production values from the production gate section:

```bash
curl --fail --silent --show-error \
  https://layalga.thecreativetoken.com/api/health
pnpm run release:probes -- \
  --target production \
  --base https://layalga.thecreativetoken.com \
  --commit <restored-candidate-sha>
```

Stop if health is not `ok`, the returned commit differs from the restored candidate, or any probe fails or is skipped.

## Release-gate change discipline

This project's release design descends from the same `cc-rpi` blueprint lineage
that, in a sibling project (Coach), accreted into an unusable release pipeline
through a long sequence of individually reasonable hardening commits — see
`docs/research/2026-08-29-release-pipeline-overengineering-audit.md` for the
audit against that case study. The rules below exist to keep this playbook's
Wave A/B/C-H structure from repeating that accretion as the project grows.
They apply to every future change that proposes a new required check, probe,
evidence artifact, or wave promotion — not only to `/release` itself.

### Risk classes

Classify every existing or proposed gate before it can block a release:

| Class | Meaning                                                                         | Default authority                                                        |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A     | Stops a known bad candidate from reaching production                            | Mandatory release critical path                                          |
| B     | Proves exact identity, rollback readiness, or safe recovery                     | Mandatory release critical path                                          |
| C     | Monitoring or operational-readiness signal                                      | Asynchronous or a separate readiness gate, not the release critical path |
| D     | Deep diagnostic, exploratory, security, performance, or broad regression signal | Normal CI, scheduled, or an explicitly requested deep-release mode       |
| E     | Ceremony, duplicated evidence, or proof-of-proof with no unique risk            | Do not add; remove if found                                              |

Only Class A and Class B controls belong on the default mandatory path. Wave A
today is Class A/B by design (required checks, identity match, cleanup proof).
Wave B (`/explore-release`) is Class D and stays off the default path until the
adopted-scope trigger is met. Waves C-H remain deferred per ADR 0001 and stay
Class C/D/E until a specific, named risk promotes one.

### Required section for any new release-gate proposal

Before adding or promoting a gate, write this section (in the PR description or
the plan that introduces it):

```markdown
### Release-system impact

- Risk class (A/B/C/D/E):
- Unique production risk prevented:
- Existing controls that already cover part of this risk:
- Why this must be synchronous (if Class A/B):
- Added local critical-path time:
- Added remote critical-path time / workflows / deployments:
- Added external dependencies:
- Added evidence objects:
- Same-candidate recovery behavior if this gate fails:
- Control this replaces or consolidates, if any:
```

The default answer to "should this block every release?" is no until the
proposal demonstrates a unique Class A or Class B risk not already covered.

### Recovery-state vocabulary

Once release automation exists, every failure must resolve to one of these —
never one undifferentiated "blocked" state:

- **`PAUSED`** — the candidate has not been disproved; a repairable external
  or observer condition (a flaky CLI watch, a transient network read, a
  missing local prerequisite) can be fixed and the same candidate resumed.
- **`BLOCKED`** — the release cannot safely continue for this candidate
  without a source or policy change; a new candidate and new authorization
  are required.
- **`ROLLED_BACK`** — production promotion occurred, a post-promotion proof
  failed, and rollback completed; the production attempt is over and this
  candidate must not be tagged.
- **`PUBLICATION_PENDING`** — production proof passed but tag or release
  publication did not complete; only publication resumes, production is not
  redeployed.

A transient CLI, network, or provider-observer failure must never collapse
into `BLOCKED`/`ROLLED_BACK` the way it did in Coach (case study lines
357-409, 411-429). Draw this distinction explicitly in the first
implementation of any release controller.

### Budgets

Once a release has actually run once, record measured budgets here (local
admission p95, delivery-to-publication p95, max serial remote workflows, max
production deployment attempts) and treat any proposal that would blow the
budget as requiring the impact section above, not silent acceptance. No percentile budget exists yet; these are the durations measured during v1.0.0 on 2026-09-05, one release, not a p95:

- Pull request CI (unit, integration, acceptance, CodeQL, dependency review): 8 to 9 minutes per head; a `develop` → `main` release pull request ran it twice because `gh pr update-branch` created a new head.
- Merge to `main` → Vercel production reports the new commit at `/api/health`: about 2 minutes.
- `scripts/deploy-agentcore.sh` (bundle, upload, runtime update, READY): about 3 minutes.
- One full run of the retired nine-probe gate against production: 3 to 4 minutes.
- Whole release, two candidates, from the version-bump pull request to the tag: about 3 hours 40 minutes, most of it the candidate-1 investigation.

Serial remote workflows per candidate: two pull requests (fix or prep → `develop`, `develop` → `main`). Production deployment attempts: two candidates.

### Warning signs — audit immediately if any become true

- The same journey or probe runs at more than one layer (local, CI, Preview,
  production) with no stated reason for the duplication.
- A new gate is proposed with "improves safety" as its only justification and
  no risk-class label.
- An analyzer or aggregator is proposed to interpret the output of another
  analyzer or aggregator.
- A monitoring or operational-readiness signal (Class C) gains the power to
  roll back or block a healthy, correctly identified candidate.
- A transient observer error (a CLI watch, a flaky readback) becomes a
  terminal state for an otherwise-healthy candidate.
- A wave is promoted from deferred to mandatory without a named, specific
  risk driving the promotion.
