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
10. Run a fresh-context exploratory charter for the four-beat demo path.
11. Present complete evidence and residual risk to the product owner.
12. Obtain separate tag and publication authorization.
13. Create and push the named tag last through `/release`.

## Current release decision

BLOCKED. Application code, tests, CI evidence, deployments, identity verification, rollback, and required-probe automation do not exist yet.

## Rollback

No rollback command exists because deployment is not configured. The deployment plan must define provider-specific rollback, restored-identity verification, and post-rollback health checks before the first production release.
