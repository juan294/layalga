# Phase 2: release probes and CI on fixture households

Parent: [plan](../2026-10-15-real-use-launch.md)

The release probes stop depending on the demo seed, demo sessions and demo API routes. One probe suite serves local CI and production; a `--target` flag selects which probes run.

## Files

| File | Action |
| --- | --- |
| `scripts/release-probes.ts`, `scripts/release-helpers.ts` and their tests | edit |
| `scripts/agentcore-smoke.ts` | edit: fixture household instead of `DEMO_SEED` (`:45-98`) |
| `scripts/demo-e2e.ts`, `scripts/demo-e2e.test.ts` | delete |
| `scripts/benchmark-coordination.ts`, `benchmark-coordination-helpers.ts`, `benchmark-coordination-helpers.test.ts` | delete (they drive the guided-demo UI test ids, `benchmark-coordination.ts:341-446`) |
| `package.json` | edit: remove `demo:e2e`, `benchmark:coordination` |
| `.github/workflows/ci.yml` | edit: remove the `demo:e2e` step (`:141`) |
| `.github/workflows/production-probes.yml` | edit |

## Step 1: probe set

All probes enqueue work through `POST /api/agent/run` with `x-layalga-internal: AGENT_ROUTE_SECRET` and drain through `GET /api/ticks` with `TICK_SECRET`, the transport probe 4 already uses (`scripts/release-probes.ts:454-538`). Every probe runs on one fixture household from `createFixtureHousehold` (phase 1).

| Probe | Local CI | Production | Assertion |
| --- | --- | --- | --- |
| `health` | yes | yes | `/api/health` ok; commit equals `--commit` for remote bases (existing, `:246-265`) |
| `host-capture` | yes | yes | `host_capture` for the fixture host completes; tagged tentative invitation exists; `executedOn` equals `--expect-runtime`; `search_memory` audit when `--expect-memory` (existing helpers `:272-361`) |
| `guest-confirmation` | yes | yes | `guest_submit` on the captured invitation; one hold and one confirmation audit (existing assertion `:363-391`) |
| `concurrent-conflict` | yes | yes | existing probe 4, now on the shared builder |
| `interrupt-resume` | yes | no | policy-triggering request; approve through the same core function `decideAction` uses (`src/app/[locale]/(host)/actions.ts:125`); one applied decision |
| `reconfirmation` | yes | no | insert a past-due reconfirmation job for a fixture visit; tick dispatches it; expected notification and status |
| `room-coordination` | yes | no | selected rooms equal the fixture's rooms (replaces the `DEMO_SEED.rooms` check, `:186-193`) |
| `guest-isolation` | yes | yes | invalid token page shows `data-status="invalid"` and no fixture party name |
| `cleanup` | yes | yes | fixture household and tagged artifacts removed; zero rows remain |

The probe count assertion (`:229`) becomes per-target. `--expect-email` no longer applies (it was tied to demo clock evidence, `:168-184`) and is removed.

```
@ runProbes(target, opts) -> ProbeReport
ctx: DATABASE_URL, LINK_TOKEN_SECRET, AGENT_ROUTE_SECRET, TICK_SECRET; APP_URL
do:
  1. validate env for the target
  2. write fixture household tagged with runId
  3. emit probes for the target in order; record each result
  4. cleanup in finally; validate zero rows remain
fail: probe failure -> continue to cleanup, print "pnpm run release:probes -- --cleanup-only <runId>", exit 1
risk: cleanup failure leaves an unbound fixture home; the printed command removes it
```

Add `--cleanup-only <runId>`: deletes the fixture household and tagged artifacts for that run and exits.

Failure outcomes follow `.claude/rules/release-gate-discipline.md`: a network or environment failure (health unreachable, tick timeout) reports `PAUSED` and the workflow can be re-dispatched for the same commit; an assertion failure on a completed run reports `BLOCKED`.

## Release-system impact

| Item | Value |
| --- | --- |
| Risk class | A for `host-capture`, `guest-confirmation`, `concurrent-conflict`, `guest-isolation` (each stops a candidate that breaks a core journey or leaks a guest); B for `health` (identity) and `cleanup` (recovery) |
| Unique risk | The production gate is the only layer that runs the candidate against AgentCore, Bedrock and the production database roles |
| Existing coverage | Local CI keeps all nine local-target probes plus Playwright; nothing moves out of CI |
| Critical-path time | Lower: the production run no longer drives a browser through `demo:e2e` (about 8 minutes per run, `gh run list` 2026-09-11/12) |
| External dependencies | None added; the production workflow no longer needs Chromium |
| Replaces | The nine-probe gate and `demo:e2e` in `production-probes.yml` |

Not added to any gate: a Google OAuth start check (it tests Google and Supabase configuration, not the candidate; phase 5 checks it once) and a production sign-in page check (duplicates the phase 3 e2e spec once the code no longer reads `DEMO_MODE`).

## Step 2: CI

- `ci.yml`: keep `test:e2e`, then start the dev server and run `release:probes --target local --base http://127.0.0.1:3008`. Remove `demo:e2e`.
- `production-probes.yml`: replace the `RESET DEMO DATA` acknowledgement (`:4-16`, `:37-40`) with `WRITE PROBE FIXTURE`; update the step summary to say it creates and deletes one fixture household; remove the `demo:e2e` step and the Chromium install; run `release:probes --target production --base <prod> --expect-runtime agentcore`. The four existing secrets are unchanged.

## Acceptance

Automated:
- `pnpm run release:probes -- --target local --base http://127.0.0.1:3008` passes against a local dev server.
- Unit tests: target selection lists the probes in the table; an injected probe failure still runs cleanup and prints the `--cleanup-only` command; an unreachable base reports `PAUSED`, a failed assertion `BLOCKED`; `--cleanup-only` removes a leftover fixture.
- `grep -rnE "DEMO_SEED|runDemoE2E|/api/demo/|demo-enter" scripts .github` returns nothing.
- All plan-level automated checks pass.

Manual: none. The first production run happens in phase 5.

## Implementation handoff (2026-10-15)

Status: complete. Commits `b2fb8ad` (implementation), `9d1e3ab` (pre-existing date failures fixed), `23535c2` (review and simplify findings).

- [x] Step 1: `scripts/release-probes.ts` runs per-target probe sets (`PROBES.local`: nine; `PROBES.production`: six) on two fixture households through `/api/agent/run` and `/api/ticks`; `--cleanup-only <runId>`; `PAUSED`/`BLOCKED` classification through the cause chain; run id printed before any write.
- [x] `recordHostDecision` (`src/core/decisions/host-decision.ts`) is shared by `decideAction` and the interrupt-resume probe.
- [x] `scripts/agentcore-smoke.ts` uses a probe-labelled fixture household; `demo-e2e` and `benchmark-coordination` scripts and package entries deleted.
- [x] Step 2: `ci.yml` runs `release:probes --target local`; `production-probes.yml` requires `WRITE PROBE FIXTURE`, drops Chromium and `demo:e2e`, and runs `--target production --expect-runtime agentcore`.
- Evidence: local dev server, `release:probes --target local` passed nine probes; `--target production --expect-runtime local` passed six; an unreachable base reported `PAUSED` with the cleanup command; zero `Release probe%` homes remained.
- Review: CHANGES REQUIRED (1 major, 5 minor, 3 nits); dispositions in the notes file. P2-R1 (AgentCore Memory records from production probe runs) is an open owner decision.
- Re-review of `23535c2`: APPROVED; its one minor item (concurrent fixture creation racing cleanup) is fixed with `Promise.allSettled`.
- Gate on `23535c2` with `DATABASE_URL` exported: `test` 782 passed, 2 failed; `test:integration` 188 passed, 2 failed (both failures are the pre-existing `src/core/demo/advance-clock.integration.test.ts`, deleted in phase 3); `test:coverage`, `build`, `verify-bootstrap` passed; `test:e2e` 27 passed, 2 failed (pre-existing `guided-demo`, deleted in phase 3).
- Not yet run in production: the first production run is phase 5 step 9.
- Next: phase 3 (entry condition met: tests no longer depend on demo sessions or the demo seed outside the two demo specs phase 3 deletes).
