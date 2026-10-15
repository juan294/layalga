# Real-use launch: implementation notes

Plan: [2026-10-15-real-use-launch.md](2026-10-15-real-use-launch.md)

## Deviations

| Phase | Plan said | Found | Chose | Why |
| --- | --- | --- | --- | --- |
| 1 | Builder writes rooms, one host, parties and invitations | The demo specs relied on a fixed demo clock (2026-09-07) and September stays | Fixture stays start on the first Friday at least 21 days after the real date (`fixtureStay`) | Non-demo homes use the system clock; fixed September dates are now in the past |
| 1 | `cleanup()` deletes auth users bound to the home's hosts "(local only)" | The same builder runs against production in phase 2 | Auth-user deletion is opt-in (`deleteBoundAuthUsers`), set only by the local e2e helper and its test | Production cleanup must never delete a hosted auth user |
| 1 | Helper at `tests/e2e/helpers/host-session.ts` with its unit test beside it | Vitest excludes `tests/e2e/**` and Playwright collects `*.test.ts` there | The helper and its test live in `src/test-support/` | Keeps both runner configurations unchanged (simplify review) |
| 2 | Every probe runs on one fixture household; the production run "creates and deletes one fixture household" | The concurrent-conflict probe needs one contested single room, which the shared three-room household cannot provide without disturbing other probes | Each run builds two households from the shared builder: `Release probe <run id>` and `Release probe conflict <run id>`; cleanup and `--cleanup-only` remove both | Keeps the existing conflict assertion exact |
| 2 | Interrupt-resume approves "through the same core function `decideAction` uses" | `decideAction` held the decision SQL inline | Extracted `recordHostDecision` (`src/core/decisions/host-decision.ts`), used by `decideAction` and the probe | One code path for the decision update |
| 2 | `grep -rnE "DEMO_SEED|runDemoE2E|/api/demo/|demo-enter" scripts .github` returns nothing | `scripts/seed-demo*` and `scripts/seed-memory*` still reference `DEMO_SEED` | Left for phase 3, which deletes or converts them (plan consumer sweep: "Seed and reset", "`scripts/seed-memory.ts`") | Phase ownership in the plan |
| 2 | (not planned) | postgres.js serialized a text array parameter as `a,b` on a fresh connection's first query (VERIFIED with a probe script) | New cleanup code uses explicit parameters and subqueries instead of array parameters | `--cleanup-only` runs that query first |
| 3 | Move the `MODEL=scripted` branch into a wrapper used by `local.ts`, `client.ts` and `/api/agent/run` | `enqueueAgentTask` never reads the model; only executing runs do. `client.ts` imports `local.ts`, so the wrapper reaches it through `LocalAgentClient` | `localRuntimeDeps` (`src/agent/runtime/local-deps.ts`) is used by `LocalAgentClient`; `/api/agent/run` and `AgentCoreClient` keep `runtimeDeps` | The model is irrelevant to enqueueing; the AgentCore bundle check proves the scripted model is not shipped |
| 3 | `src/agent/runtime/handler.ts` keeps using `runtimeDeps` alone | Its integration test ran AgentCore requests with the scripted model through `runtimeDeps` | `handleAgentCoreRequest` takes an optional deps factory (default `runtimeDeps`); the test passes `localRuntimeDeps` | Keeps production behavior and the test's coverage |
| 3 | The acceptance grep returns only the 404 checks in `tests/e2e/sign-in.spec.ts` | Regression tests must name `DEMO_MODE`, `DEMO_SESSION_SECRET` and `demo-enter` to prove leftovers are ignored | Allowed hits also include `sign-in/page.test.tsx`, `current-host.test.ts` and `current-guest.test.ts` | They assert the removal; no product code matches |
| 3 | Conversion deletes the home's audit events | Phase 5 runs the memory forget before `db push`; its `memory_forgotten` audit rows would be deleted | The migration keeps `memory_forgotten` audit rows | Keeps the accountability record of the erasure |
| 3 | (not planned) | The real Google button had no test id | Added `data-testid="google-sign-in"` to `SignInButton` | The new e2e spec and the page test assert on it |
| 3 | (not planned) | `supabase migration new` waits on stdin in a non-interactive shell | Created the file through the CLI, then wrote its content | Timestamp still assigned by the CLI |
| 3 | `.env.development.local` note | The worktree and main checkout copies still set `DEMO_MODE` and `DEMO_SESSION_SECRET` | Not edited (gitignored, local); the application ignores both | Owner may delete the two lines locally |
| 6 | Implement after phase 5 has deployed release 1 | The owner asked for every phase; the contract migration must not reach `develop` before release 1 ships, or the release 1 `db push` would drop `homes.demo` under the old web app and AgentCore bundle | Implemented on local branch `feat/drop-demo-schema`, not merged into `develop`; merge it only when phase 6 entry conditions hold | Keeps the two-release safety and the plan's order |
| 6 | Acceptance grep returns nothing | The contract migration test must name the objects it drops | The only allowed hits are in `src/core/demo-schema-contract.integration.test.ts` | It asserts the removal |
| 6 | The migration fails on a demo home and drops the objects | A plain `alter`/`drop` would fail if the migration is applied twice | The guard reads `homes.demo` only inside a nested branch taken when the column exists; drops use `if exists` | Safe re-application; tested |
| 6 | `scripts/contract-preflight.ts` compares with "the release 1 record" | The repository keeps no machine-readable release record | The operator passes `--runtime-id` and `--expected-version` from the release 1 notes; the script reads `GetAgentRuntime` and requires `READY` and the same version | A newer deploy makes it fail closed |

## Open decisions for the owner

| ID | Finding | Why it is not fixed here | Options |
| --- | --- | --- | --- |
| P2-R1 | Each production probe run writes AgentCore Memory events for its fixture parties (`host_capture` and `guest_submit` with `MEMORY=agentcore`). Database cleanup removes the parties, but the extracted long-term memory records under `/parties/home-<fixture>/party-<id>` persist; raw events expire after 30 days (`scripts/create-memory.sh:107`). About four actors accrue per run. They are home-scoped, so no real household reads them (INFERRED from `src/agent/memory.ts` actor ids). | Forgetting them from the probe needs AWS credentials in the `production-probes` workflow, which is an infrastructure and permission change outside this plan. | (a) Accept and forget probe actors periodically with `forget-synthetic-memory` extended to probe homes; (b) grant the workflow a narrow AWS role and forget fixture parties before cleanup; (c) run the production gate with `MEMORY=none` assertions off. |

## Review dispositions (phase 2)

- P2-R2 fixed: `agentcore-smoke` cleans up when no run was queued and uses a probe label that `--cleanup-only` can remove.
- P2-R3 fixed: gateway statuses (502/503/504) and connection error codes anywhere in the cause chain classify as `PAUSED`.
- P2-R4 fixed: the run id and cleanup command print to stderr before any write; fixture creation failures report stage `setup`.
- P2-R5 accepted gap: a run still executing after a `PAUSED` timeout can write an `agent_sessions` row after cleanup; the 30-day agent-session retention removes it (`supabase/migrations/20260905000300_guest_notes.sql:49-50`).
- P2-R6 noted for phase 5: the production guest-confirmation probe has only run against the scripted model; judge an `interrupted` result from Bedrock before calling it a candidate defect.
- P2-R7 fixed: the workflow run name says two households.
- P2-R8 deferred to phase 4 (owner of `CLAUDE.md` and `README.md`): command lists still name `demo:e2e`.
- P2-R9 fixed: an integration test proves `runReleaseProbes` follows `PROBES` order.

## Review and simplify dispositions (phase 3)

Review (fresh-context agent): APPROVED.

- P3-R1 fixed: `sign-in.spec.ts` targets `.postcard__error` (Next's route announcer is also `role="alert"`).
- P3-R2 fixed in the plan: `phase-6.md` now lists the three further tests that touch `homes.demo`.
- P3-R3 fixed in the plan: `phase-5.md` records that a Vercel env change needs a deployment and how to keep the sign-in gap short.
- P3-R4 fixed: stale `demo` fields removed from test mocks.
- P3-R5 accepted: the conversion test does not seed every deleted table; the foreign-key order was checked against `pg_constraint` by the reviewer and production holds none of those rows (research, 2026-10-15).
- P3-R6 fixed: migration comment.

Simplify (four angles): applied `requiredEnvironment` reuse, `householdMonth(timeZone, now)`, one ternary in guest email preferences, `schedulerForHome` renamed `configuredScheduler`, and the household timezone carried on `HostRecord` (one query fewer per host page). Not applied, with reason: the migration's session-id union stays a copy (one-shot migration); `runDueJobs` stays as the test seam for job runs; the `loadGuestInvitation` clock parameter stays because the plan requires a caller clock for fake-clock tests; the `runtimeDeps` home existence check stays for a clear error; the env refusal keeps its explicit message instead of a per-environment enum; the handler deps factory stays because the testing rule prefers injecting over mocking owned modules.

## Review dispositions (phase 4)

Documentation written by a separate agent in worktree `layalga-real-use-docs` (branch `docs/real-use-launch`, commit `9c89b3f`), merged as `64b7866`. Parent checks: acceptance grep (remaining hits are history or transition text), relative links in 33 changed files resolve, no remaining `docs/submission` path, bootstrap passes, v1.3.11 commit `3ce5736` verified against the tag. Independent review: CHANGES REQUIRED, then fixed:

- P4-R1 fixed: the README and identity runbook said the seed uses placeholder emails; the seed maps the two operator addresses (as `restore_demo_identity_claims` did in the public migration history).
- P4-R2 fixed: the runbook lists everything the conversion deletes.
- P4-R3 fixed: the runbook says the production gate needs the web role's host insert and delete grants.
- P4-R4 fixed: the playbook carries the Vercel env-change window caveat from `phase-5.md`.
- P4-R5 fixed for Mermaid: the three affected `.mmd` sources were edited and re-rendered with Mermaid CLI 11.12.0 (SVG, and PNG for the topology); the draw.io view stays marked stale.
- P4-R6 fixed: the edited docs index line uses a colon instead of an em dash; existing em dashes elsewhere in that list are unchanged.

## Review and simplify dispositions (phase 6)

Branch `feat/drop-demo-schema` (local, unmerged). Review: CHANGES REQUIRED, then fixed:

- P6-R1 fixed: the retention integration test now covers the notification (180 days) and host email ping (90 days) branches.
- P6-R2 fixed: deviation row for the acceptance-grep hits in the contract test.
- P6-R3 fixed: the contract test restores and asserts every dropped object.
- P6-R7 fixed: the playbook marks `forget-synthetic-memory` as release 1 only.
- Verified by the reviewer, no change: the retention body equals the previous one minus the demo predicates; revoking `usage on schema private` from the web runtime removes nothing it still uses; `GetAgentRuntime` reports the latest version, so a later deploy fails the preflight closed.

Simplify: applied `util.parseArgs`, the `AWS_REGION` idiom from `agentcore-smoke`, one rollback helper in the contract test, a static nested guard instead of dynamic SQL, and removal of the dead `MEMORY_ID`/`AWS_REGION` members of `requiredEnvironment`. Kept the `demo: true` field in the `current-host` regression mock, which models the retired demo-era lookup on purpose.

## Pre-existing failures found at the phase 1 baseline

VERIFIED on unchanged `develop` (`fea093b`) on 2026-10-15, with `DATABASE_URL` set as the CI integration job sets it: `tests/e2e/guided-demo.spec.ts` (2 runs, demo clock outcome `no_eligible`) and 17 vitest tests in 3 files fail identically: `src/core/booking/invitations.integration.test.ts` (2), `src/core/demo/advance-clock.integration.test.ts` (2) and `src/core/reconfirmation/jobs.test.ts` (13). They pin a `FakeClock` to September 2026 while rows take database defaults such as `available_at = now()` and fixed link expiry `2026-10-01`, so they started failing once the real date passed those values. The `Coverage` workflow stays green because it runs unit tests only.

Correction: an earlier count in this session (25 tests in 8 files) came from a run without `DATABASE_URL`; `handler.test.ts`, `run-data.test.ts`, `guest-preferences`, `host-outcomes` and `guest-clock` then failed only on the missing variable. Every gate run below exports `DATABASE_URL`.
