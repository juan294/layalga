# L’Ayalga Release Verification Playbook

## Status

Release automation is implemented and has run once. v0.4.0 (main `0935fed`) was deployed to Vercel production and to AgentCore runtime `layalga_agent-mONXXjFms4` version 12 from the same commit, and all nine release probes passed against production with `--expect-runtime agentcore`. No command in this playbook grants deployment, rollback, tag, publication, DNS, AWS, or GitHub mutation authority; each release obtains them at the named gates.

## Project adaptation profile

| Area                           | Project value                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                        | L’Ayalga                                                                                                                                                                |
| Intended repository visibility | Public                                                                                                                                                                  |
| Product type                   | Web application with an agent runtime                                                                                                                                   |
| Package and build system       | pnpm 11 and Next.js 16                                                                                                                                                  |
| Integration branch             | `develop`                                                                                                                                                               |
| Production branch              | `main`; promoted from `develop` by pull request                                                                                                                         |
| Merge strategy                 | Squash pull requests                                                                                                                                                    |
| Release artifact               | Exact Git commit plus matching web and agent deployments                                                                                                                |
| Web deployment                 | Vercel production from `main`; v0.4.0 verified                                                                                                                          |
| Agent deployment               | AgentCore runtime `layalga_agent-mONXXjFms4`, bundle deployed per release by `scripts/deploy-agentcore.sh`                                                              |
| Local target                   | Application, local Supabase, demo auth, and scripted model                                                                                                              |
| Preview target                 | Vercel environment configured; no candidate deployment verified                                                                                                         |
| Staging target                 | None                                                                                                                                                                    |
| Production target              | `https://layalga.thecreativetoken.com`; v0.4.0 verified with nine probes on AgentCore                                                                                   |
| Tests                          | Vitest, local Supabase integration tests, and Playwright                                                                                                                |
| Primary datastore              | PostgreSQL through Supabase                                                                                                                                             |
| Queue and scheduler            | Durable PostgreSQL run queue and jobs; `after()` dispatch plus Vercel Cron recovery                                                                                     |
| Authentication                 | Invitation links, optional guest claims, Google hosts, and synthetic demo hosts                                                                                         |
| Notifications                  | In-app bilingual notifications; host-only email pings through Amazon SES (`EMAIL=ses` set in production; delivery not yet proven there); no WhatsApp or Twilio          |
| Other vendors                  | Strands runs on Amazon Bedrock Sonnet 4.5 through the AgentCore runtime in production, verified by v0.4.0's nine probes; scripted locally for tests and the demo driver |
| Release approver               | Product owner                                                                                                                                                           |
| Rollback authority             | Product owner                                                                                                                                                           |

## Environment truth

| Environment | Exact artifact? | Real auth? | Real datastore? | Real vendors? | Safe writes? | Limitation                                                                                                                                                                                                                                                                                           |
| ----------- | --------------: | ---------: | --------------: | ------------: | -----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local       |              No |        Yes |             Yes |            No |          Yes | Google OAuth passed locally; normal evidence uses demo hosts and `MODEL=scripted`                                                                                                                                                                                                                    |
| CI          |             Yes |         No |             Yes |            No |          Yes | Exact checkout with ephemeral Supabase; no real auth or vendor calls                                                                                                                                                                                                                                 |
| Preview     |              No |         No |             Yes |            No | Not verified | Vercel values configured; no candidate deployment or Google auth verified                                                                                                                                                                                                                            |
| Staging     |             N/A |        N/A |             N/A |           N/A |          N/A | No staging environment planned                                                                                                                                                                                                                                                                       |
| Production  |             Yes |         No |             Yes |       Partial |          Yes | v0.4.0 bound nine probes to the exact commit with `--expect-runtime agentcore`; Bedrock and AgentCore are real and verified; Google host sign-in and actual SES delivery are not yet verified on production — `EMAIL=ses` is set, but the four-beat proof is a release-time check (`--expect-email`) |

## Adopted scope

Wave A is mandatory once the application has a release candidate. It must enforce:

- At least one required check passed. Zero-pass runs fail.
- Every required failure or skip blocks release.
- Required checks cannot be excused by quarantine.
- Evidence names one fixed candidate commit.
- Web and agent deployment identities match that candidate.
- Synthetic data cleanup is verified.
- The product owner explicitly authorizes deployment and publication.
- The release tag is the final action.

Wave B exploratory charters become applicable after the first deployed candidate. Waves C through H are deferred because this is a greenfield, deadline-bound hackathon build with no production history. Reconsider them after the first release or when the risk profile changes.

## Initial required probes

The first implementation plan must make these probes executable:

1. Public application health and deployed identity.
2. Host capture queues one run, reaches a terminal result, and creates one synthetic tentative invitation.
3. Guest confirmation creates one hold and one confirmed visit.
4. A concurrent conflicting confirmation is rejected safely.
5. A social exception pauses for host approval and resumes through a new queued run exactly once.
6. Clock-driven reconfirmation follows policy and escalates a non-response.
7. Unauthorized guest access is denied without exposing another guest.
8. All run-owned synthetic records are removed.

`scripts/release-probes.ts` executes these probes in order. It resets and drives the fixed demo home through the public HTTP surface, creates one probe home tagged with a random run ID for the concurrency check, and deletes only the tagged demo artifacts and that exact tagged probe home. Cleanup runs in `finally` and verifies that the run-owned invitations, runs, sessions, and probe home are gone.

The four-beat assertion is four notifications in total: two party reconfirmation chases and exactly two host escalation notifications. The owner approved this correction, and the plan and executable probe now use the same count.

## Executable local verification

Start the application with the local runtime and scripted model in one terminal:

```bash
pnpm run db:start
set -a
source .env.local
set +a
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres
export LINK_TOKEN_SECRET=e2e-link-token-secret-at-least-32-bytes
export DEMO_SESSION_SECRET=e2e-demo-session-secret-at-least-32-bytes
export TICK_SECRET=e2e-tick-secret-at-least-32-bytes
export AGENT_ROUTE_SECRET=e2e-agent-route-secret-at-least-32-bytes
export CRON_SECRET=e2e-cron-secret-at-least-32-bytes
export APP_URL=http://localhost:3008
export AGENT_RUNTIME=local
export MODEL=scripted
export DEMO_MODE=true
export SCHEDULER=none
pnpm run dev
```

Run the deterministic four-beat demo and all eight probes from another terminal:

```bash
set -a
source .env.local
set +a
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres
export LINK_TOKEN_SECRET=e2e-link-token-secret-at-least-32-bytes
export TICK_SECRET=e2e-tick-secret-at-least-32-bytes
pnpm run demo:e2e -- --base http://localhost:3008
pnpm run release:probes -- --base http://localhost:3008
```

For a non-local target, bind the probes to one exact candidate commit:

```bash
pnpm run demo:e2e -- --base https://layalga.thecreativetoken.com
pnpm run release:probes -- \
  --base https://layalga.thecreativetoken.com \
  --commit <candidate-sha> \
  --expect-runtime agentcore \
  --expect-email \
  --expect-memory
```

The release probe refuses a non-local target without `--commit`. Both scripts require `DATABASE_URL` for authoritative final-state checks. Concurrent probe calls must receive distinct queued acknowledgements. The probe performs one authorized queue drain, re-draining every 15 seconds for up to 90 seconds to absorb an AgentCore cold start, polls those exact run IDs to terminal states, and then verifies the database result. The demo script does not print private guest-link tokens.

Three flags assert facts the process cannot otherwise observe on a remote target, because the probe process does not share the deployed environment:

- `--expect-runtime local|agentcore` asserts `executedOn` on the probe 5 resume run and the probe 2 capture run.
- `--expect-email` asserts one `sent` `host_email_pings` row per host after the pending-decision beat and after the escalation beat (two hosts, so two rows each); omit it when `EMAIL=none` on the target.
- `--expect-memory` asserts a `search_memory` `tool_call` audit row on the probe 2 capture run; omit it when `MEMORY=none` on the target.

Omitting a flag does not assert the corresponding behavior did not happen; it only skips the assertion. Pass all three only when the target's environment is known to have `AGENT_RUNTIME=agentcore`, `EMAIL=ses`, and `MEMORY=agentcore` set.

## Database runtime readiness

Apply all migrations through `20260831083526_agent_first_room_coordination.sql` before the web candidate starts. Follow [the runtime database and identity runbook](runtime-database-and-identity.md) to set unique passwords for `layalga_web` and `layalga_agent`, configure each deployment with its service-specific non-owner `DATABASE_URL`, and verify grants with `current_user`. A production URL that starts with the database owner is a release blocker.

The queue recovers expired run leases and permits bounded attempts. Scheduled jobs retry after one minute and five minutes. A third failure changes the job to `quarantined`; inspect and replay it with the same runbook. Do not replay queued or running work.

## Release procedure

1. Obtain explicit release authorization.
2. Confirm a clean worktree and the documented branch topology.
3. Fix one candidate commit and record it in the release evidence.
4. Run typecheck, lint, targeted tests, full tests, and build sequentially.
5. Stop if no required check passed or any required check failed or skipped.
6. Apply the candidate migrations and verify the separate runtime database roles.
7. Deploy the exact candidate to both authorized production targets: the Vercel web deployment from `main`, and the AgentCore runtime bundle built from the same commit with `scripts/deploy-agentcore.sh --profile archy`. A candidate whose agent bundle lags the web deployment is not one candidate.
8. Verify the deployed identity against the candidate.
9. Run all required probes with synthetic, run-scoped data.
10. Verify datastore state, queue completion, interrupt behavior, notification outcome, and cleanup.
11. Present complete evidence and residual risk to the product owner.
12. Obtain separate tag and publication authorization.
13. Create and push the named tag last through `/release`.

## Current release decision

RELEASED. v0.4.0 passed every gate on 2026-09-04: candidate CI green, both deployment identities on `0935fed`, agent database role verified, nine production probes passed with the AgentCore runtime asserted, cleanup verified, tag pushed last. Since then, Phases 1, 2, and 4 of the final-stretch plan (`docs/plans/2026-09-03-hackathon-final-stretch.md`) added the run timeline, host email pings through Amazon SES, and AgentCore OpenTelemetry tracing on `develop`; the next release, v0.5.0, promotes that candidate to `main` and runs this procedure again on it. The measured budget for the v0.4.0 run was about 45 minutes from release PR to tag, dominated by three candidate rebuilds after production-only findings (agent role lock, agent bundle identity, reconfirmation delivery).

## Rollback

Rollback is a separate production mutation and requires explicit owner authorization.

Web rollback:

```bash
vercel rollback <previous-deployment>
curl --fail --silent --show-error \
  https://layalga.thecreativetoken.com/api/health
```

Production dispatch is `AGENT_RUNTIME=agentcore` (decided in [ADR 0002](../decisions/0002-agent-runtime.md)). A rollback to the local runtime is the one-flag change:

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

After either rollback, verify restored identity and probe 1 before any other probe:

```bash
curl --fail --silent --show-error \
  https://layalga.thecreativetoken.com/api/health
pnpm run release:probes -- \
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
budget as requiring the impact section above, not silent acceptance. There is
no budget yet because there is no release history (`docs/release/e2e-pro-playbook.md:88-90`).

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
