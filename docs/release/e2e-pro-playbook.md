# L’Ayalga Release Verification Playbook

## Status

Releases from v0.4.0 through v1.3.11 used the retired demo-based gate: a browser demo driver and nine probes that reset and drove the shared synthetic demo home. v1.3.2 (main `90b6838`, 2026-09-11) is the last release that passed that gate in full, on AgentCore runtime version 30. The historical decisions below record each release and the evidence that substituted when the full gate could not run.

The real-use launch replaces that gate. Demo mode, the demo seed and the demo API routes are removed, so every probe now runs on fixture households that the probe creates and deletes. One probe script serves local CI and production, and `--target` selects the probe set. The new production gate first ran for v2.0.0 (real-use release 1) on 2026-10-15 and passed. No command in this playbook grants deployment, rollback, tag, publication, DNS, AWS, or GitHub mutation authority; each release obtains them at the named gates.

Guest email delivery remains unactivated and follows [its readiness runbook](guest-email-readiness.md). Merging to develop does not apply migrations, IAM or deployments; merging to `main` deploys the web app immediately. No feature/develop Vercel preview deployments are allowed.

## Invitation identity cutover

The bridge commit `8f845859cdb44e8128378927339d43694c6c9fae` supports explicit returning parties and treats older capture tasks as new parties. Ship the bridge independently. Keep the existing name constraint until the bridge web app and worker both serve traffic and have passed fixture captures.

Before applying `20261119000100_allow_shared_party_names.sql` in an authorized release, complete these checks in order. The migration was named `20261118000100` until the v2.4.0 release preparation renamed it to sort after the link recovery migration.

1. Verify `/api/health` reports the exact web commit released with bridge support. Record the web deployment and source commit. Verify the worker build source and bundle identity from the corresponding deployment and record its runtime version.
2. Run `pnpm run contract:preflight -- --runtime-id "$AGENTCORE_RUNTIME_ID" --expected-version "$BRIDGE_RUNTIME_VERSION"` using the version from the verified compatible build. The preflight checks the **DEFAULT** endpoint and requires it to be ready and serving that version.
3. Use the existing authorized production probe workflow with the exact web commit and expected runtime `agentcore` on the bridge schema. The tagged host capture uses a selected fixture party and checks the invitation belongs to that ID. Retain its run ID, the local fallback capture evidence, the old queued-task result and the old runtime's refusal of a persisted v2 task. Recheck both serving identities if either deployment changes before the migration.
4. With missing, stale or failed evidence, keep the bridge schema. Hosts can select a known returning record or supply a distinct display label for a new group until both writers are verified.

After duplicate names exist, a rollback must keep the bridge's explicit-ID behavior on both web and worker. A writer that looks up parties by name can assign a visit or its memory to another family. Reinstating the old constraint would conflict with valid data. Keep the duplicates and use a compatible build or a forward fix. Historical account or memory repairs require a separate owner review.

### v2.4.0 rollout order

v2.4.0 ships the bridge, shared names and link recovery in one candidate. That candidate serves as the bridge: with the name constraint in place, a New capture with a name already in use fails with `captureNameUsed` and the host is asked for a distinct label. The owner chose this order on 2026-11-19, so both cutovers above apply without a separate bridge release. For v2.4.0 it replaces step 6 of the release procedure below, which applies every migration before the merge. Run each `supabase` command from the primary checkout, because only that checkout holds the project link in `supabase/.temp`. Step 5 also needs that checkout at the candidate commit.

1. Apply only `20261118000200_invitation_link_recovery.sql` while v2.3.1 still serves both targets. Build the stage from the candidate commit and take only the link files from the primary checkout. Run the block in bash (it uses `compgen`):

   ```bash
   (
     set -euo pipefail
     CANDIDATE=<candidate-sha>
     STAGE=$(mktemp -d)
     git archive "$CANDIDATE" supabase | tar -x -C "$STAGE"
     cp -R supabase/.temp "$STAGE/supabase/"
     rm "$STAGE/supabase/migrations/20261119000100_allow_shared_party_names.sql"
     if compgen -G "$STAGE/supabase/migrations/*allow_shared_party_names*" >/dev/null; then
       echo "the constraint drop is still staged" >&2; exit 1
     fi
     supabase db push --linked --workdir "$STAGE" --dry-run   # must list only 20261118000200
     read -r -p "Dry run lists only 20261118000200? Type yes: " answer
     [ "$answer" = yes ]
     supabase db push --linked --workdir "$STAGE"
     rm -rf "$STAGE"
   )
   ```

   Check that `supabase migration list --linked` shows `20261118000200` applied and `20261119000100` pending, and that `/api/health` stays `ok`.

2. Merge the release pull request into `main`. Verify the exact web commit at `/api/health`. Until AgentCore is updated, the old runtime refuses the new `host_capture_v2` task, so the hosts do not capture invitations in this window. If a capture is refused, record its run ID as the old-runtime refusal evidence.
3. Deploy AgentCore from a clean checkout of the same commit with `scripts/deploy-agentcore.sh --profile archy`. Pass the runtime version it reports to `pnpm run contract:preflight -- --runtime-id layalga_agent-mONXXjFms4 --expected-version <reported version>`.
4. Dispatch the production probes for the exact commit. The workflow passes `--expect-runtime agentcore` and `MEMORY=agentcore`. `host-capture` asserts the selected returning party and the bound run and recovery metadata. It then derives the guest link with the probe's `LINK_TOKEN_SECRET` (`PROD_LINK_TOKEN_SECRET`), checks that it matches the hash AgentCore stored, and opens it against the serving web app, which must accept it. Together these prove that AgentCore, Vercel and the GitHub copy hold the same link secret. A failure means that a new link could not be revealed.
5. Apply `20261119000100_allow_shared_party_names.sql`: `supabase db push --linked --dry-run` must list only that migration, then run `supabase db push --linked`. Confirm that `parties_home_id_family_name_key` is gone and that `supabase migration list --linked` shows no pending migration.
6. Dispatch the production probes again for the same commit, then run the orphaned-memory sweep. The production probe set has no same-name capture, so this run proves that the constraint drop did not break the core journeys. The local release probes and integration tests cover two parties with one name.

Checks from the two cutovers above that this order replaces:

| Cutover check                                                                   | v2.4.0 evidence                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate bridge release and fixture captures on the bridge schema               | Local rehearsal with the database reset to `20261118000200`: the production probe set passed, and a same-name New capture failed with `captureNameUsed`; then production probes in step 4 |
| Old runtime refusal of a persisted v2 task                                      | Phase 1 local evidence; any refusal seen in step 2                                                                                                                                        |
| Synthetic capture that shows the legacy replacement warning and keeps the URL   | Chromium and mobile WebKit browser tests on the candidate, locally and in CI                                                                                                              |
| Reveal twice from status and dashboard, then open the original URL as the guest | The same browser tests                                                                                                                                                                    |
| Same `LINK_TOKEN_SECRET` on web and AgentCore                                   | The `host-capture` hash assertion and guest page check in step 4                                                                                                                          |

The production probes do not drive the browser reveal: fixture households have no Google host who can sign in. A production check of the reveal on the real household needs a separate owner decision, because tests never write to the real household.

#### Release-system impact of the link hash assertion

- **Risk class (A/B/C/D/E):** A.
- **Unique production risk prevented:** AgentCore and Vercel read `LINK_TOKEN_SECRET` from different sources (`.env.agentcore` and the Vercel environment). A mismatch makes every new invitation link unrecoverable for its host. Local and CI runs use one environment for both, so only production can show it.
- **Existing controls that already cover part of this risk:** None. The browser tests and local probes share one secret.
- **Why this must be synchronous (if Class A/B):** A mismatch breaks the host's only way to obtain a new guest link.
- **Added local critical-path time:** None.
- **Added remote critical-path time / workflows / deployments:** None; one query, one HMAC and one guest page request inside the existing `host-capture` probe.
- **Added external dependencies:** None.
- **Added evidence objects:** None beyond the probe detail.
- **Same-candidate recovery behavior if this gate fails:** The candidate code is not disproved. A hash mismatch points to the AgentCore or GitHub copy, a rejected link to Vercel. Correct that secret, redeploy only the affected target from the same candidate and dispatch the probes again.
- **Control this replaces or consolidates, if any:** The manual `LINK_TOKEN_SECRET` parity check in "Recoverable invitation links" step 2.

### Recoverable invitation links

After the identity cutover above, deploy link recovery in this order during an authorized release.

1. Apply the additive migration `20261118000200_invitation_link_recovery.sql`. Check that the existing hash-only invitations still resolve through the guest entry point and that older writers can still insert rows.
2. Serve the new web reader and reveal action first. Verify the exact serving web commit at `/api/health`. With an authorized synthetic capture, confirm its creator sees the legacy replacement warning and can keep the existing URL. Web and AgentCore must use the same existing `LINK_TOKEN_SECRET` for this deployment.
3. Deploy the matching AgentCore writer. Verify the serving DEFAULT version against the recorded bundle using the contract preflight above. Trace one synthetic capture to its completed run and bound invitation, reveal it twice from the status page and dashboard, and open the original URL in the guest fixture. Record the run and deployment identities without including the URL.

Once the first recoverable link has been issued, keep the web reader that shows the same active token. If restoring a web version that rotates links on reveal is unavoidable, pause host capture and reveal before rollback, or forward-fix the web app. Keep guest access by hash available. Before restoring a worker that lacks same-run replay, drain new capture writes and verify their terminal runs and associated invitations. Continue to honor the explicit-party rollback minimum after shared names exist.

## Project adaptation profile

| Area                           | Project value                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                        | L’Ayalga                                                                                                                                                                                                                                                                      |
| Intended repository visibility | Public                                                                                                                                                                                                                                                                        |
| Product type                   | Web application with an agent runtime                                                                                                                                                                                                                                         |
| Package and build system       | pnpm 11 and Next.js 16                                                                                                                                                                                                                                                        |
| Integration branch             | `develop`                                                                                                                                                                                                                                                                     |
| Production branch              | `main`; promoted from `develop` by pull request                                                                                                                                                                                                                               |
| Merge strategy                 | Squash pull requests                                                                                                                                                                                                                                                          |
| Release artifact               | Exact Git commit plus matching web and agent deployments                                                                                                                                                                                                                      |
| Web deployment                 | Vercel production from `main`, deployed automatically on merge                                                                                                                                                                                                                |
| Agent deployment               | AgentCore runtime `layalga_agent-mONXXjFms4`, bundle deployed per release by `scripts/deploy-agentcore.sh`                                                                                                                                                                    |
| Local target                   | Application, local Supabase, real local Supabase sessions on fixture households, and the scripted test model                                                                                                                                                                  |
| Preview target                 | Disabled for feature/develop branches; no preview deployments                                                                                                                                                                                                                 |
| Staging target                 | None                                                                                                                                                                                                                                                                          |
| Production target              | `https://layalga.thecreativetoken.com`; production probe target on two fixture households                                                                                                                                                                                     |
| Tests                          | Vitest, local Supabase integration tests, Playwright, and the local release probe target                                                                                                                                                                                      |
| Primary datastore              | PostgreSQL through Supabase                                                                                                                                                                                                                                                   |
| Queue and scheduler            | Durable PostgreSQL run queue and jobs; `after()` dispatch plus Vercel Cron recovery                                                                                                                                                                                           |
| Authentication                 | Google hosts admitted by `host_identity_claims`, verified guest requesters, invitation links and optional guest claims                                                                                                                                                        |
| Notifications                  | In-app reminders and host SES pings; consented guest email implemented, production activation pending. SES acceptance is not delivery                                                                                                                                         |
| Other vendors                  | AgentCore uses Strands on Bedrock. The web also calls Bedrock directly with filtered guest scheduling language. The production model is Sonnet 4.6. Production probes exercise the AgentCore model path. Local tests use a scripted interpreter and a mocked Bedrock adapter. |
| Release approver               | Product owner                                                                                                                                                                                                                                                                 |
| Rollback authority             | Product owner                                                                                                                                                                                                                                                                 |

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

`scripts/release-probes.ts` runs the probes for one target in order. Both targets build two fixture households from the shared builder (`src/test-support/fixture-household.ts`): `Release probe <run id>` with three rooms, and `Release probe conflict <run id>` with one contested room for the concurrency probe. The local self-service booking probe also creates a third household and a synthetic verified requester. Agent probes enqueue work through `POST /api/agent/run` with the `x-layalga-internal` header and drain it through `GET /api/ticks`. No probe uses a browser session or touches a real household.

| Probe                  | Local | Production | Assertion                                                                                                                                                                                                                                                                                              |
| ---------------------- | :---: | :--------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `health`               |  yes  |    yes     | `/api/health` is `ok`; for a non-local base, the reported commit equals the candidate                                                                                                                                                                                                                  |
| `host-capture`         |  yes  |    yes     | A `host_capture_v2` run for a selected fixture party completes and creates one tagged tentative invitation for that party; with link recovery applied, the run binding, recovery metadata and a link hash that matches the probe's `LINK_TOKEN_SECRET`; optional runtime and memory assertions (below) |
| `guest-confirmation`   |  yes  |    yes     | A `guest_submit` run on the captured invitation creates one hold and one confirmation audit                                                                                                                                                                                                            |
| `concurrent-conflict`  |  yes  |    yes     | Two concurrent holds on the one contested room: exactly one wins and the other is rejected safely                                                                                                                                                                                                      |
| `interrupt-resume`     |  yes  |     no     | A policy-triggering request pauses; a recorded host approval resumes it through a new queued run and applies once                                                                                                                                                                                      |
| `reconfirmation`       |  yes  |     no     | A past-due reconfirmation job for a fixture visit is dispatched by the tick, with the expected notification and status                                                                                                                                                                                 |
| `room-coordination`    |  yes  |     no     | The selected rooms equal the fixture household's rooms                                                                                                                                                                                                                                                 |
| `guest-isolation`      |  yes  |    yes     | An invalid guest token page shows the invalid state and no fixture party name                                                                                                                                                                                                                          |
| `self-service-booking` |  yes  |     no     | A first-time requester selects fourteen nights and receives one receipt. One household host decision confirms the exact rooms and dates and schedules follow-up.                                                                                                                                       |
| `cleanup`              |  yes  |    yes     | Removes the run-owned households and their artifacts. The local self-service fixture also removes its synthetic account.                                                                                                                                                                               |

Cleanup runs in `finally`, also after a failed probe. A run ends in one of three states:

- `passed`: every probe for the target passed and cleanup verified zero remaining rows.
- `PAUSED`: the environment failed (unreachable base, gateway status, dropped database connection, run timeout). The candidate is not disproved; repair the environment and run the same candidate again.
- `BLOCKED`: an assertion failed on a completed run. The candidate needs a fix.

On any failure the script exits with status 1 and prints the run ID and `pnpm run release:probes -- --cleanup-only <run id>`. That command removes the run’s fixture households and their tagged artifacts. On the local database it also removes the self-service fixture and its synthetic requester. Use it when a run stops before its own cleanup finishes.

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

Rotate the matching environment secret whenever one of those Vercel production values rotates. `LINK_TOKEN_SECRET` must also match `.env.agentcore`, because since v2.4.0 AgentCore stores the link hash that the web app verifies; the `host-capture` probe fails when the three copies differ. An outdated `PROD_LINK_TOKEN_SECRET` makes the fixture guest-link hashes differ from what the deployed application expects, and an outdated route or tick secret makes the probes fail authentication.

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

Owner decision P2-R1, option (a), chosen 2026-10-15: each production run writes AgentCore Memory events for its fixture parties. Database cleanup deletes the fixture homes, but the long-term memory records extracted under `/parties/home-<fixture home>/party-<id>` remain; raw events expire after 30 days. About four actors accrue per run. They are scoped to the fixture homes, so the real household does not read them. The gate stays as it is. After production probe runs, `pnpm run memory:forget-orphans` (`scripts/forget-orphaned-memory.ts`) forgets the memory whose party no longer exists. It finds party actors from both raw events (`ListActors`) and long-term record namespaces under `/parties`, reads `homes` joined with `parties`, and treats as orphaned only an actor of the exact form `home-<uuid>/party-<uuid>` whose party is not in that home. That covers deleted fixture homes and parties deleted from a home that still exists, such as the synthetic parties the real-use conversion removed: the coordinator searches a home's whole `/parties/home-<id>` subtree during host capture, so their memory would otherwise still reach the real household. AgentCore keeps listing an actor after its events are deleted, so an actor known only from `ListActors` counts only while one of its sessions still holds an event. It ignores ids of any other form and writes no audit row because the party is gone. It reports only by default; `--apply` deletes.

The script reads the production database and deletes production memory, so each run needs owner authorization. It needs `DATABASE_URL` (a production runtime role URL), `MEMORY_ID` (`LayalgaHouseholdMemory-CBgKZc7mK4`), `AWS_REGION` (`us-east-1`) and AWS credentials allowed by `infra/iam/memory-data-plane.json`. It prints how many homes and parties it read. A wrong `DATABASE_URL` is the main risk: an empty database makes every home look deleted, and a database that also holds the real household (the local seed does) makes every real party look deleted. The script stops when the homes read returns no rows; `--apply` also stops, deleting nothing, when the real household is not among the homes read, and it requires `--project-ref hyyrnpyidipkuhakeiyb`, which must match the user `<role>.<ref>` on a Supabase pooler host or the direct host (`db.<ref>.supabase.co`) in `DATABASE_URL`. Run the dry run first. Check that the home and party counts match production, that no reported home has a current party among the reported actors, and that there is no warning about records it could not attribute to a party. The real household can appear in the report for parties that were deleted from it. Then apply, and repeat the dry run to confirm that it reports 0 orphaned actors. Record deletion in AgentCore can take a moment, so a repeat right after `--apply` may still list a few records, and a second `--apply` in that window can fail with `BatchDeleteMemoryRecords failed`. Wait a minute and run the dry run again:

```bash
pnpm run memory:forget-orphans
pnpm run memory:forget-orphans -- --apply --project-ref hyyrnpyidipkuhakeiyb
pnpm run memory:forget-orphans
```

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
12. Create and push the annotated tag on the deployed `main` commit and publish the GitHub Release from the changelog entry, last. Owner decision 2026-11-28: release authorization covers the tag and the GitHub Release, so they need no separate approval. Do this only after every production probe, cleanup and the memory sweep passed and `main` equals the deployed commit; otherwise stop and report.
13. Record the release in `CLAUDE.md`, this playbook and the roadmap on `develop`.

## Real-use launch releases

The real-use launch ([plan](../plans/2026-10-15-real-use-launch.md)) removes demo mode in two releases. Schema removal needs two steps because migrations run before the web deploy and AgentCore deploys separately: dropping `homes.demo` while the old web app or the old AgentCore bundle still reads it would break live requests. Release 1 shipped as v2.0.0 on 2026-10-15. Release 2 shipped as v2.2.0 on 2026-10-16; the steps below are retained as rollout history. Every future production action needs explicit owner authorization at the time it runs.

Release 1 (expand) follows the release procedure above, with these additional actions ([phase 5](../plans/2026-10-15-real-use-launch-phases/phase-5.md)):

- Read-only preflight: repeat the household counts. Any visit, or any home other than `…0001`, stops the release and goes to the owner.
- Confirm that the Google OAuth client is published "In production" and lists the Supabase callback URI.
- Disable the email provider in hosted Supabase Auth, keep Google enabled, and check that `/auth/v1/settings` reports `email: false` and `google: true`.
- Remove `DEMO_MODE` and `DEMO_SESSION_SECRET` from Vercel production. Vercel applies the change only to a new deployment: until the merge deploys, the old build still reads `DEMO_MODE=true`. After the conversion it finds no demo home and shows neither Google sign-in nor demo entry, so merge directly after `db push`, or redeploy the current build after the env change as a separate authorized action.
- Run `pnpm run forget-synthetic-memory` against the production AgentCore Memory store to remove the synthetic Vega and Parker records. This script exists only in release 1 code; release 2 deletes it.
- Apply the conversion migration with `supabase db push --linked` before the merge. Home `…0001` then has `demo = false`, no parties, invitations or rooms, two hosts and two claims.
- After the deploy and the production gate, the owner signs in with Google and reaches the empty household dashboard.

Release 2 (contract) starts only after release 1's AgentCore runtime version is recorded ([phase 6](../plans/2026-10-15-real-use-launch-phases/phase-6.md)). A preflight script (`pnpm run contract:preflight -- --runtime-id <id> --expected-version <n>`) refuses to continue unless the AgentCore DEFAULT endpoint is READY and serves the recorded version of a bundle that no longer reads the demo schema. v2.1.0 replaced release 1's version 38 with version 39, so release 2 passes 39. The contract migration fails while any home has `demo = true`. It redefines the retention function without its demo predicates and drops `homes.demo`, `demo_clock`, the demo mutation tables, `review_access_events` and `private.restore_demo_identity_claims()`. Release 2 then follows the normal procedure and production gate.

## Real-use release decisions

RELEASED. v2.0.0, real-use release 1, shipped 2026-10-15 on its first candidate, main `e0cb4d1242c777b92a0e3a841081960b174afdbd` (pull request #201). `main` was already an ancestor of `develop`, so no reconciliation merge was needed. The release pull request passed CI, CodeQL, coverage and dependency review. The read-only preflight found one home (`…0001`, `demo = true`), 2 parties, 2 invitations, 0 visits, 0 runs, 3 rooms, 2 hosts and 2 claims. Hosted Supabase Auth reports `email: false` and `google: true`. `DEMO_MODE` and `DEMO_SESSION_SECRET` are removed from Vercel production; their Preview copies remain, and Preview deployments stay disabled. Migration `20261015082739_convert_household_to_real_use.sql` was applied directly before the merge; home `…0001` then had `demo = false`, 0 parties, invitations and rooms, 2 hosts and 2 claims. `/api/health` reported the candidate with status `ok` and no stale work. AgentCore runtime `layalga_agent-mONXXjFms4` moved from version 37 (S3 object version `aGkoYkHAMOcWbZ.k7Mbmz24D9oiVVmQt`) to version 38 (S3 object version `rqpNEq_vsxcXiIUd7dFWpnzahz7P0Yz1`), built from a clean detached checkout of the candidate. The [production probe run](https://github.com/juan294/layalga/actions/runs/38724687108) passed all six production probes, including cleanup; a later read showed 1 home, 0 runs and 0 visits. The live sign-in page shows only the Google button, `/en/demo-enter` returns 404, and the owner signed in with Google and reached the host dashboard of home `…0001` with an empty room ledger and the add-room form.

The synthetic memory forget (`pnpm run forget-synthetic-memory`) first hit the operating environment's permission classifier; after the owner granted the permission it ran later the same day and removed 36 memory records for Familia Vega and 0 for The Parkers, with 0 raw events for either. A follow-up listing showed no records under either party namespace, and both `memory_forgotten` audit rows exist. One release-1 item stays open: the Google OAuth app is still in publishing status "Testing" with no test users, and its redirect URI is correct. The owner's sign-in worked; whether the second host can sign in before the app is published or the host is added as a test user is unverified.

RELEASED. v2.1.0, Google sign-in for real use, merged to `main` as `ed6c574a335124767ba91506d1c46a2e5ed50348` (pull request #202) on 2026-10-15, after a reconciliation merge (`fb4d579`) whose tree equalled the tested candidate. The local gate on the candidate tree passed: typecheck, lint, 177 integration tests, 591 unit tests with 56.18% statement coverage, build, bootstrap, agent bundle, 26 browser tests and the local probe target. The pull request passed CI, CodeQL, coverage and dependency review. Vercel serves the candidate (`/api/health` status `ok`, no stale work), and `/en/privacy` and `/es/privacy` return 200. The Google OAuth app's Branding page now lists the home page `https://layalga.thecreativetoken.com/en/sign-in`, the privacy policy `https://layalga.thecreativetoken.com/en/privacy` and the authorized domain `thecreativetoken.com`. The operating environment's permission classifier first blocked the AgentCore deploy and the Google "Publish app" action; after the owner granted both permissions the same day, the deploy from a clean checkout of `ed6c574` moved AgentCore runtime `layalga_agent-mONXXjFms4` to version 39 (status `READY`), and the Audience page shows publishing status "In production". Production probe run 38768377213 on `ed6c574` with `--expect-runtime agentcore` passed every probe and its cleanup. The orphaned-memory sweep then removed that run's leftovers in two passes: 1 record and 4 events of 3 actors across 2 fixture homes, then 4 records that AgentCore had extracted for one of those actors after the first pass. A dry run about 3 minutes later reported 0 orphaned actors. Run the sweep a few minutes after a probe run, and repeat the dry run until it reports 0. The `v2.1.0` tag and GitHub release were published last. No migration is in this release.

The same day, the orphaned-memory sweep ran against production (option (a) of P2-R1). The first, home-level version deleted 14 records and 4 events of 19 actors across 10 deleted fixture homes. It also showed 300 records under the real household for 45 parties that the real-use conversion had deleted, which host capture could still search. The per-party version (`develop` `fd14973`, `de2922d`) then deleted those 300 records across 48 actors. After AgentCore finished its asynchronous deletion, a repeat dry run reported 0 orphaned actors, and no long-term record remained under `/parties`.

RELEASED. v2.2.0, real-use release 2 (contract), merged to `main` as `3e433f1f96d962a3d54484779e95a6f5ecbb2c5a` (pull request #203) on 2026-10-16; its tree equals `develop` `ab64d14`. The local gate on `27cbed8` (later commits changed only docs) passed with the contract applied to a reset local database: typecheck, lint, 178 integration tests, 600 unit tests with 56.42% statement coverage, build, bootstrap, agent bundle, 26 browser tests and the local probe target. The pull request passed CI, CodeQL, coverage and dependency review. Before the migration, a production read showed no home with `demo = true`, empty demo clock and mutation tables, 5 hackathon rows in `private.review_access_events`, and web-runtime grants in `private` only on the two objects the migration drops. `pnpm run contract:preflight -- --runtime-id layalga_agent-mONXXjFms4 --expected-version 39` passed, and `supabase db push --linked` applied `20261015084815_drop_demo_schema.sql` while v2.1.0 served both targets. A follow-up read showed the column, the four tables and the restore function gone, no `private` usage for `layalga_web_runtime`, one home and two host claims; that read also called `private.apply_data_retention()` once, which completed. After the merge, Vercel served the candidate (`/api/health` status `ok`, no stale work), the AgentCore deploy from a clean checkout of `3e433f1` moved the DEFAULT endpoint to version 40 (`READY`), and production probe run 38855885750 passed every probe and its cleanup. The orphaned-memory sweep then removed the run's leftovers. The `v2.2.0` tag and GitHub release were published last. The first nightly retention run after the contract (2026-10-17 03:17 UTC) succeeded in `cron.job_run_details`.

RELEASED. v2.2.1, a dependency and security update with no migrations, merged to `main` as `78ddbbc5a8514f4a82b514214c304f9b5de0c6b3` (pull request #204) on 2026-10-17; its tree equals `develop` `43c80e2`. The local gate on `43c80e2` passed in sequence: database reset, typecheck, lint, 156 test files with 778 tests, 26 browser tests, the 10 local probes with cleanup, and build. The pull request passed CI, CodeQL, coverage and dependency review. A read of `/api/health` before the merge showed `3e433f1` with status `ok`; after it, Vercel served `78ddbbc` with status `ok` and no stale work. The AgentCore deploy from a clean checkout of `78ddbbc` moved the DEFAULT endpoint from version 40 to version 41 (`READY`, `liveVersion` 41); the previous S3 object version `IqVful8GI3Fwdd4Ni0q.X2axEehWyv5s` is the rollback point. Production probe run 39027478141 passed every probe and its cleanup. The auto-mode classifier denied the orphaned-memory sweep (`pnpm run memory:forget-orphans`), so it has not run for this release. Pending: that sweep, a dry run first.

RELEASED. v2.3.0, sign-in identity with no migrations, merged to `main` as `af828809ea1e934347f31408ad840356a83e1ba3` (pull request #205) on 2026-10-17; its tree equals `develop` `e867955`. The owner ran the merge command after the operating environment's permission classifier denied it for the session. The local gate on `e867955` passed in sequence: typecheck, lint, 160 test files with 814 tests, 31 browser tests, the 10 local probes with cleanup, build, `verify-bootstrap.sh` and the agent bundle. The local `db reset` was skipped on purpose: `supabase/` had no change since `main`, so it would only have re-proved unchanged migrations and destroyed local data. CI, CodeQL and coverage passed on the candidate commit, and the pull request passed CI, CodeQL, coverage and dependency review. A read of `/api/health` before the merge showed `78ddbbc` with status `ok`; after it, Vercel served `af82880` with status `ok` and no stale work. The AgentCore deploy from a clean checkout of `af82880` moved the DEFAULT endpoint from version 41 to version 42 (`READY`, `liveVersion` 42, S3 object version `MvT0UNCNMwY5oMMkSreFzHsTLB2s._p2`); the previous S3 object version `Xh0cc946AtUVG.f7sOj6Hj2Td9sxCjWN` is the rollback point. Production probe run 39033763460 passed every probe and its cleanup. The orphaned-memory sweep followed: the dry run found 6 orphaned actors across 4 fixture homes, the first `--apply` failed for 1 of 2 records while AgentCore was still extracting, and after two minutes a second apply forgot 6 records and 2 events for the last 2 actors; the final dry run reported 0 orphaned actors. The reconciliation merge of `main` into `develop` left a tree identical to the pre-merge `develop`. Open: the owner check on production with a real Google account (the picker appears, the header shows the email and Google avatar, `/es` reads "Libro del hogar"); if the header shows a monogram instead of the picture, the Google `picture` field name needs a production check.

HOTFIX. Next.js 16.3.8 to 16.4.2, a forward-patch security hotfix with no migrations and no version bump or tag, merged to `main` as `339b62a9370dd097b0ca929176bff24c0f424b5a` (pull request #211) on 2026-10-22. The pull request targeted `main` on purpose, and the back-merge `3df9375` carried it into `develop`. It patches CVE-2026-96889 (Image Optimization RCE), GHSA-673q-mjm6-r5xr (`use cache` RCE) and GHSA-p3m5-59mp-jv5r (Server Actions DoS). The commit changes `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` and `playwright.config.ts`; the last two pipe the Playwright dev-server log into CI output and upload acceptance traces on failure. The pull request's local gate ran on Node 22, not Node 24: typecheck, lint, 121 unit test files with 636 tests and build passed; the integration suites and browser tests did not run locally because the sandbox had no Supabase stack. CI run 39752547331 and CodeQL run 39752547504 passed on `339b62a`. On 2026-10-23, `/api/health` served `339b62a` with status `ok` and no stale work, and the AgentCore DEFAULT endpoint was `READY` on `liveVersion` 42, last updated 2026-10-17, so the hotfix did not redeploy AgentCore. The owner approved the `production-probes` environment on 2026-10-23, and production probe run 39753158349 passed health, host capture, guest confirmation, concurrent conflict, guest isolation and cleanup. The server action hang that Next 16.4.0 and 16.4.1 showed is still present on 16.4.2. On 2026-10-23 the repeat of the guest-link and host-view browser specs ran locally against `next dev` (Next 16.4.2, React 19.2.9, Playwright 1.64.0, Chromium), with the unbounded `response.finished()` wait restored by reverting `3843b92`: `--repeat-each 4 --retries 0` on 16 tests gave 64 runs, of which 61 passed and 3 failed. All three failures hit the 90-second test timeout at `response.finished()` (`tests/e2e/helpers/async-actions.ts:22`): two in `guest-link.spec.ts` and one in `host-view.spec.ts`. CI run 39758320414 on Next 16.4.2, which `3843b92` cited, failed the same way. A repeat against a production build (`next build && next start`) did not run: with `NODE_ENV=production` the app refuses `MODEL=scripted` (`src/lib/server/env.ts:97`), and the browser tests depend on the scripted model. So it is not known whether the hang affects production; the production probes passed. The orphaned-memory sweep followed on 2026-10-23. The dry run read 1 home and 0 parties and found 3 orphaned actors across 2 homes, `4ff38b50-0c11-4de9-a696-536be6711483` and `90644511-6961-4265-bfb2-a4092a2e491e`. The probe log does not record fixture home ids, so the homes were matched to the probe run by time: the AgentCore sessions of all 3 actors were created between 06:28:03 and 06:28:34 UTC, inside the run's 06:27:49 to 06:28:36 window. A dry run right before `--apply` showed the same scope, and `--apply` forgot 3 records and 4 events. The first dry run after it still listed 1 actor under `90644511`; about 90 seconds later the dry run reported 0 orphaned actors, with no second apply.

RELEASED. v2.4.0, invitation identity and link recovery with two migrations, merged to `main` as `587f42c84b07b2ab8f6bfe9cd34295e481928760` (pull request #229) on 2026-11-19; its tree `ed81fbf` equals `develop` `a15dd56`. The owner chose the staged order in "v2.4.0 rollout order" and the migration rename. The local gate on `a15dd56` passed in sequence on a disposable Supabase stack with a fresh replay of 33 migrations: bootstrap, typecheck, lint, 724 unit tests with 54.01% statement coverage, 933 tests in 170 files, build, agent bundle, 42 Chromium and mobile WebKit tests, the Next 16.4.6 server-action repeat (84 of 84 runs passed, where 16.4.2 failed 3 of 64) and the 10 local probes with cleanup. A rehearsal with the database reset to `20261118000200` passed the production probe set with the name constraint present, and a same-name New capture failed with `captureNameUsed`. Two independent reviews found no blocker; their findings produced the staged push commands and the `host-capture` link checks. CI, CodeQL and coverage passed on `a15dd56` and on the pull request. `20261118000200` was applied alone while v2.3.1 served both targets. After the merge Vercel served `587f42c`; the AgentCore deploy from a clean checkout of `587f42c` moved the DEFAULT endpoint from version 43 to version 44 (`READY`, S3 object version `p5PzxhF42MZ7B_kjMyI0QNpNEAVQLiWZ`), and the contract preflight passed for version 44. The rollback point is version 43's S3 object version `3GT4XSuYMsvKYPUW0S4XzSMr9o8W2oIK`.

Production probe run 44486483721 was `BLOCKED` at `host-capture`: the stored link hash matched the probe secret, but the serving web app rejected the derived link. Vercel production held a different `LINK_TOKEN_SECRET` from AgentCore and the `PROD_LINK_TOKEN_SECRET` copy, which had never mattered before because v2.3.1 issued every link on the web side. A valid fixture link passed the same page check against a local production build, so the check itself was sound. Production had 0 invitations, so the owner chose to set the Vercel production value to the AgentCore value and redeploy the same build (`layalga-9m99ys382`). Probe run 44489269729 then passed every probe and its cleanup. `20261119000100` was applied next; `parties_home_id_family_name_key` is gone, all four recovery columns exist and no migration is pending. Probe run 44489594215 passed every probe and its cleanup on the final schema. The orphaned-memory sweep read 1 home and 0 parties, forgot 10 records and 9 events for 7 actors across 5 fixture homes, and a dry run 90 seconds later reported 0 orphaned actors. The `v2.4.0` tag and GitHub release were published last. The production probes do not drive the browser reveal or the legacy replacement warning; browser tests cover them. The owner's first real capture is the first production use of the reveal.

RELEASED. v2.5.0, guest-initiated booking with four migrations, merged to `main` as `64d6aa19ca7134d18817514270fc2216b3d23710` (pull request #230) on 2026-11-21; its tree equals the tested candidate `bb565cc`. The twelve local checks passed on `bb565cc`, including 1,085 tests, 57 Chromium and WebKit journeys, the 10 local probes with cleanup, the web build, the agent bundle and the legacy-room migration check. CI, CodeQL, coverage and dependency review passed before the migrations ran. `20261121000100` to `20261121000400` were applied while v2.4.0 served, and both runtime roles kept their privileges. The AgentCore DEFAULT endpoint moved from version 44 to version 45. Production probe run 44939708898 passed every probe and its cleanup; the orphaned-memory sweep removed four records and four events for three probe actors, and the final report found zero orphaned actors. The probes did not cover live direct web Bedrock interpretation or a real Google sign-in for a self-initiated stay. The `v2.5.0` tag and GitHub release were published on 2026-11-22.

RELEASED. v2.5.1, Google sign-in before guest discovery with no migrations, merged to `main` as `dc12595b607af647c4f8e2272842f04d8486a99c` (pull request #231) on 2026-11-22; its tree equals `develop` `a748480`. The owner accepted an independent source review and a redacted Gitleaks scan in place of the local Strix scan for this release. All 1,108 unit and integration tests and 57 browser scenarios passed locally. The AgentCore DEFAULT endpoint moved to version 46 (S3 object version `XziIPiEXDvaK2FZR6taq9huyzm.6pWCl`). Production probe run 45032233105 passed every probe and its cleanup; the orphaned-memory sweep removed two records and four events for three probe actors, and the final read found zero. CI attempt 1 on `main` failed before any integration test because port 54622 was occupied on the runner; the owner authorized one retry, and attempt 2 passed (run 45032089750). The owner published the GitHub release on 2026-11-22 at 18:25 UTC. The reconciliation merge of `main` into `develop` (`cf6d23b`, 2026-11-24) left a tree identical to the pre-merge `develop`.

RELEASED. v2.5.2, a booking fix and a dependency update with no migrations, merged to `main` as `c1e65fb4203e6ad91e35974f064374b8358d1335` (pull request #239) on 2026-11-25; its tree equals the tested candidate `8450fd6`. The local gate passed on `8450fd6`: 1,110 tests, 57 browser tests, the local probes with cleanup, the room migration check, build, agent bundle and audit. The independent review found that postgres.js 4 pipelines queries outside transactions, which Supavisor before 2.10 can leave unanswered. On Supavisor 2.9.5 the app client hung in 20 of 20 runs; with `max_pipeline: 1` it hung in none, and the local probes and 23 browser tests passed through that pooler. The pooler check recorded on 2026-11-24 ran on 2.10.1 and does not prove behavior on an older pooler. The hosted version is unknown. The owner accepted the local Strix result, which is a Claude fallback with no findings after the main engine's guardrail refused, and one S4 known issue: the conversation field has no distinct disabled style during page load. CI, CodeQL, coverage and dependency review passed on the candidate, and CI and CodeQL passed on `main`. The AgentCore DEFAULT endpoint moved from version 46 to 47 (S3 object version `daLAsiEmYyrtvIJPuotRQcqbmKuN5jWr`); the rollback point is version 46's `XziIPiEXDvaK2FZR6taq9huyzm.6pWCl`. A rollback covers both the web app and AgentCore. Production probe run 45561298712 passed every probe and its cleanup. The orphaned-memory sweep forgot five records and four events for three probe actors, and the final read found zero. The `v2.5.2` tag and GitHub release were published on 2026-11-25.

RELEASED. v2.5.3, sign-in security with no migrations, merged to `main` as `26434e15e4e2af2e253de805b3f31d1317062505` (pull request #240) on 2026-11-25; its tree equals the tested candidate `ed5ec71`. The local gate passed on `ed5ec71`: 1,132 tests, 57 browser tests, the local probes with cleanup, the room migration check, build, agent bundle and audit. Before the last log-only change, a connected client's token placed in a web session cookie was refused on six pages with a real local OAuth server, and sign-out with the Auth container stopped took five seconds and deleted every session cookie. Independent reviews of both changes found no S1 or S2. Strix exited 0 through its Claude fallback with one LOW finding, rejected after the real Supabase client left no session cookie in four logout failures. The owner accepted two known issues: S3, a page that a signed-in account loads during a sign-in outage shows no sign-out button; S4, a revocation without an answer in five seconds may not complete on the server. All seven workflow runs passed on the candidate. The AgentCore DEFAULT endpoint moved from version 47 to 48 (S3 object version `h9XHdvKSSonCUzlXiUePuAsKGRx2hbjG`); the rollback point is version 47's `daLAsiEmYyrtvIJPuotRQcqbmKuN5jWr`. Production probe run 45573308074 passed every probe and its cleanup. CI attempt 1 on `main` failed at Start Supabase because port 54622 was in use on the runner, before any test; the owner authorized one retry, and attempt 2 passed (run 45573071184). The orphaned-memory sweep forgot seven records and four events for three probe actors, and the final read found zero. The `v2.5.3` tag and GitHub release were published last.

RELEASED. v2.6.0, read-only access for connected assistants shipped switched off, merged to `main` as `78714c7a1a4c998be3ca2c4be1e1bc8818ae4b03` (pull request #241) on 2026-11-27; its tree equals `develop` `0b4f3ea`. The local gate passed all 13 steps on `ff33f7a`: 1,716 tests, 420 integration tests, 78 browser tests, the ten local probes with cleanup, the room migration check, build, agent bundle, route smoke and audit. An independent review of the notes against the diff found six S4 gaps, fixed in `ff33f7a`. The first pull request run reported CodeQL alert 3 (`js/incomplete-sanitization`, open on `develop` since 2026-11-26) in `assistant-consent.test.tsx`; the owner chose to fix it first, and `0b4f3ea` changed only that test. Strix exited 0 on `ff33f7a` (Claude fallback) and `0b4f3ea` (Strix engine) with no findings. `supabase db push --linked` applied `20261125000100_assistant_access.sql` while v2.5.3 served; production stayed healthy. The AgentCore DEFAULT endpoint moved from version 48 to 49 (S3 object version `Vzzr6BBD.9LGBHHGQukP8db7Z_lMdHXQ`); the rollback point is version 48's `h9XHdvKSSonCUzlXiUePuAsKGRx2hbjG`. `contract:preflight` needs `AWS_PROFILE=archy`. Production probe run 46047838777 passed every probe and its cleanup. The orphaned-memory sweep forgot four records and four events for three probe actors, and the final read found zero. A later read found one home, no probe home, no open run and an empty assistant allowlist. Activation G0 and G1 passed; the G1 owner queries need `supabase db query --yes`, because `--read-only` runs as `supabase_read_only_user`. The `v2.6.0` tag and GitHub Release were published last. G2 followed on 2026-11-28: the hook went on at 06:08 CET, a host and a guest signed in at 06:10 CET with `Hook ran successfully` before each login, and a host session opened before the change refreshed through the hook at 07:19 CET with no hook error in the Auth logs.

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
evidence artifact, or wave promotion — not only to `/rpi-release` itself.

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
Wave B (`/rpi-explore-release`) is Class D and stays off the default path until the
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
