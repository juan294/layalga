# Phase 3: release v2.3.0

Parent: [plan](../2026-10-17-host-sign-in-identity.md)

Ships phases 1 and 2. Every production action here needs the owner's authorization at the time it runs; the v2.2.1 authorization does not carry over.

## Entry conditions

- Phases 1 and 2 accepted and integrated into local `develop`; clean tree.
- The owner authorizes release v2.3.0.
- One fixed candidate commit, recorded in the release evidence.

## Steps (per `docs/release/e2e-pro-playbook.md`, release procedure)

1. Prepare: `package.json` to 2.3.0; a `[2.3.0]` `CHANGELOG.md` entry (Added: account chip, Changed: account picker, host dashboard names); search the old version across product files.
2. Local gate on the candidate, sequential with every exit kept: db reset on this checkout's own stack after `docker inspect` proves ownership, typecheck, lint, test, test:e2e, local probes, build, `bash scripts/verify-bootstrap.sh`.
3. Push `develop`; inspect CI, CodeQL and Coverage for that exact commit.
4. Open the release pull request `develop` into `main`; wait for its checks; squash-merge. This deploys the web app. No migration runs.
5. AgentCore: `src/agent` and the bundle script are untouched, but the playbook requires one candidate on both targets, so deploy the bundle from a clean checkout of the merge commit with `scripts/deploy-agentcore.sh --profile archy` (runtime 41 to 42), unless the owner records a deviation. Record the previous S3 version for rollback first.
6. Verify identity: `/api/health` shows the merge commit; the DEFAULT endpoint serves the new runtime version.
7. Dispatch `Production probes` from `main` with the exact commit and `WRITE PROBE FIXTURE`; approve the environment gate; require every probe and cleanup to pass.
8. Memory sweep after the probes (`pnpm run memory:forget-orphans`, dry run, then apply with `--project-ref hyyrnpyidipkuhakeiyb`), which needs the owner's `/permissions` approval.
9. Reconciliation merge of `main` into `develop` (`-X ours`, then confirm the tree diff against the pre-merge commit is empty); push `develop`.
10. Record the release evidence in the playbook, `README.md`, `CLAUDE.md` and `docs/roadmap.md`; then tag `v2.3.0` at the merge commit and publish the release with notes read back from the file.

## Owner check on production (manual)

1. Open the sign-in page, press "Continue with Google": the account picker appears.
2. Choose the host account: the dashboard header shows that email and its Google avatar, or the monogram if Google supplies none.
3. Open `/es` and confirm "Libro del hogar".
4. If the avatar shows a monogram instead of the picture, report it: the Google identity field name needs a production check, and the plan's INFERRED item becomes a finding.

## Stuck states

- Release blocked before the merge: nothing production-facing changed; leave `develop` as is and report.
- Merge done, AgentCore deploy fails: the web app is already live and independent of the bundle; roll the bundle back to the recorded S3 version and report.
- Probes fail: read the run state first (`PAUSED` re-dispatches the same candidate after the environment is repaired; `BLOCKED` needs a fixed candidate).

## Exit

Tag and release published last; evidence recorded; the owner check above reported back.
