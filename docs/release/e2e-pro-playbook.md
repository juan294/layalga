# L’Ayalga Release Verification Playbook

## Status

Bootstrap baseline. No application, remote repository, CI run, deployment, or production environment exists. Release is blocked until the missing surfaces below are implemented and verified.

## Project adaptation profile

| Area | Project value |
|---|---|
| Project | L’Ayalga |
| Intended repository visibility | Public |
| Product type | Web application with an agent runtime |
| Package and build system | pnpm and Next.js, planned but not installed |
| Integration branch | `develop` |
| Production branch | `main`; promoted from `develop` by pull request |
| Merge strategy | Squash pull requests |
| Release artifact | Exact Git commit plus matching web and agent deployments |
| Web deployment | Not selected; release blocked |
| Agent deployment | AgentCore Runtime preferred; day-one spike pending |
| Local target | Bootstrap scaffold only |
| Preview target | Not configured |
| Staging target | None |
| Production target | `https://layalga.thecreativetoken.com`, not configured |
| Tests | Not configured; targeted Vitest and Playwright suites planned |
| Primary datastore | PostgreSQL through Supabase, planned |
| Queue and scheduler | EventBridge Scheduler, planned |
| Authentication | Not selected |
| Notifications | Not selected; no WhatsApp or Twilio in hackathon scope |
| Other vendors | Strands Agents, Amazon Bedrock, and AgentCore pending verification |
| Release approver | Product owner |
| Rollback authority | Product owner |

## Environment truth

| Environment | Exact artifact? | Real auth? | Real datastore? | Real vendors? | Safe writes? | Limitation |
|---|---:|---:|---:|---:|---:|---|
| Local | No | No | No | No | Yes | Scaffold only |
| CI | No | No | No | No | Yes | Workflow exists only for bootstrap validation |
| Preview | N/A | N/A | N/A | N/A | N/A | Not configured |
| Staging | N/A | N/A | N/A | N/A | N/A | No staging environment planned |
| Production | No | No | No | No | No | Not configured |

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
2. Host capture creates one synthetic tentative invitation.
3. Guest confirmation creates one hold and one confirmed visit.
4. A concurrent conflicting confirmation is rejected safely.
5. A social exception pauses for host approval and resumes exactly once.
6. Clock-driven reconfirmation follows policy and escalates a non-response.
7. Unauthorized guest access is denied without exposing another guest.
8. All run-owned synthetic records are removed.

## Release procedure

1. Obtain explicit release authorization.
2. Confirm a clean worktree and the documented branch topology.
3. Fix one candidate commit and record it in the release evidence.
4. Run typecheck, lint, targeted tests, full tests, and build sequentially.
5. Stop if no required check passed or any required check failed or skipped.
6. Deploy the exact candidate to the authorized preview or production targets.
7. Verify both deployed identities against the candidate.
8. Run all required probes with synthetic, run-scoped data.
9. Verify datastore state, interrupt behavior, notification outcome, and cleanup.
10. Run a fresh-context exploratory charter for the four-beat demo path. This is Wave B and applies starting with the *second* release attempt onward — the adopted scope defers Wave B until after the first deployed candidate exists (see "Adopted scope" above), so the first release skips this step.
11. Present complete evidence and residual risk to the product owner.
12. Obtain separate tag and publication authorization.
13. Create and push the named tag last through `/release`.

## Current release decision

BLOCKED. Application code, tests, CI evidence, deployments, identity verification, rollback, and required-probe automation do not exist yet.

## Rollback

No rollback command exists because deployment is not configured. The deployment plan must define provider-specific rollback, restored-identity verification, and post-rollback health checks before the first production release.

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

| Class | Meaning | Default authority |
|---|---|---|
| A | Stops a known bad candidate from reaching production | Mandatory release critical path |
| B | Proves exact identity, rollback readiness, or safe recovery | Mandatory release critical path |
| C | Monitoring or operational-readiness signal | Asynchronous or a separate readiness gate, not the release critical path |
| D | Deep diagnostic, exploratory, security, performance, or broad regression signal | Normal CI, scheduled, or an explicitly requested deep-release mode |
| E | Ceremony, duplicated evidence, or proof-of-proof with no unique risk | Do not add; remove if found |

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
