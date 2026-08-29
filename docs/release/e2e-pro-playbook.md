# L’Ayalga Release Verification Playbook

## Status

Local release automation is implemented. Preview and production environment values are configured in Vercel, but no candidate deployment or real Google authentication has been verified. Production verification remains blocked until the owner authorizes deployment. No command in this playbook grants deployment, rollback, tag, publication, DNS, AWS, or GitHub mutation authority.

## Project adaptation profile

| Area                           | Project value                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Project                        | L’Ayalga                                                                                         |
| Intended repository visibility | Public                                                                                           |
| Product type                   | Web application with an agent runtime                                                            |
| Package and build system       | pnpm 11 and Next.js 16                                                                           |
| Integration branch             | `develop`                                                                                        |
| Production branch              | `main`; promoted from `develop` by pull request                                                  |
| Merge strategy                 | Squash pull requests                                                                             |
| Release artifact               | Exact Git commit plus matching web and agent deployments                                         |
| Web deployment                 | Vercel configured; no candidate deployment verified                                              |
| Agent deployment               | Local Next.js runtime selected by ADR 0002                                                       |
| Local target                   | Application, local Supabase, demo auth, and scripted model                                       |
| Preview target                 | Vercel environment configured; no candidate deployment verified                                  |
| Staging target                 | None                                                                                             |
| Production target              | `https://layalga.thecreativetoken.com`; environment configured, no candidate deployment verified |
| Tests                          | Vitest, local Supabase integration tests, and Playwright                                         |
| Primary datastore              | PostgreSQL through Supabase                                                                      |
| Queue and scheduler            | PostgreSQL jobs plus configured Vercel Cron fallback                                             |
| Authentication                 | Link tokens and synthetic demo hosts; real Google auth blocked                                   |
| Notifications                  | In-app bilingual notifications; no WhatsApp or Twilio                                            |
| Other vendors                  | Strands scripted locally; real Bedrock use remains unverified                                    |
| Release approver               | Product owner                                                                                    |
| Rollback authority             | Product owner                                                                                    |

## Environment truth

| Environment | Exact artifact? | Real auth? | Real datastore? | Real vendors? | Safe writes? | Limitation                                                                              |
| ----------- | --------------: | ---------: | --------------: | ------------: | -----------: | --------------------------------------------------------------------------------------- |
| Local       |              No |         No |             Yes |            No |          Yes | Working tree uses demo hosts and `MODEL=scripted`; exact candidate not fixed            |
| CI          |             Yes |         No |             Yes |            No |          Yes | Exact checkout with ephemeral Supabase; no real auth or vendor calls                    |
| Preview     |              No |         No |             Yes |            No | Not verified | Vercel values configured; no candidate deployment or Google auth verified               |
| Staging     |             N/A |        N/A |             N/A |           N/A |          N/A | No staging environment planned                                                          |
| Production  |              No |         No |             Yes |            No | Not verified | Vercel values configured; no candidate deployment, Google auth, or vendor call verified |

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
export APP_URL=http://localhost:3000
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
pnpm run demo:e2e -- --base http://localhost:3000
pnpm run release:probes -- --base http://localhost:3000
```

For a non-local target, bind the probes to one exact candidate commit:

```bash
pnpm run demo:e2e -- --base https://layalga.thecreativetoken.com
pnpm run release:probes -- \
  --base https://layalga.thecreativetoken.com \
  --commit <candidate-sha>
```

The release probe refuses a non-local target without `--commit`. Both scripts require `DATABASE_URL` for authoritative final-state checks. The demo script does not print private guest-link tokens.

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

BLOCKED. All eight local probes pass, and Preview and Production environment values include `CRON_SECRET` and the separate `AGENT_ROUTE_SECRET`. The exact candidate, terminal CI evidence, deployment authorization, deployed identity, and two consecutive production demo runs are not yet available.

## Rollback

Rollback is a separate production mutation and requires explicit owner authorization.

Web rollback:

```bash
vercel rollback <previous-deployment>
curl --fail --silent --show-error \
  https://layalga.thecreativetoken.com/api/health
```

The accepted Phase 0 verdict is `AGENT_RUNTIME=local`, so the current release has no AgentCore runtime artifact to roll back. If a later authorized release changes that verdict, restore the previous S3 object version with the same runtime configuration used for deployment:

```bash
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id <runtime-id> \
  --agent-runtime-artifact '{"codeConfiguration":{"code":{"s3":{"bucket":"<bucket>","prefix":"<key>","versionId":"<previous-version-id>"}},"runtime":"NODE_22","entryPoint":["app.js"]}}' \
  --role-arn <runtime-role-arn> \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --protocol-configuration '{"serverProtocol":"HTTP"}' \
  --profile archy \
  --region us-east-1
```

After either rollback, verify restored identity and probe 1 before any other probe:

```bash
curl --fail --silent --show-error \
  https://layalga.thecreativetoken.com/api/health
pnpm run release:probes -- \
  --base https://layalga.thecreativetoken.com \
  --commit <restored-candidate-sha>
```

Stop if health is not `ok`, the returned commit differs from the restored candidate, or any probe fails or is skipped.
