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

## Pre-existing failures found at the phase 1 baseline

VERIFIED on unchanged `develop` (`fea093b`) on 2026-10-15, with `DATABASE_URL` set as the CI integration job sets it: `tests/e2e/guided-demo.spec.ts` (2 runs, demo clock outcome `no_eligible`) and 17 vitest tests in 3 files fail identically: `src/core/booking/invitations.integration.test.ts` (2), `src/core/demo/advance-clock.integration.test.ts` (2) and `src/core/reconfirmation/jobs.test.ts` (13). They pin a `FakeClock` to September 2026 while rows take database defaults such as `available_at = now()` and fixed link expiry `2026-10-01`, so they started failing once the real date passed those values. The `Coverage` workflow stays green because it runs unit tests only.

Correction: an earlier count in this session (25 tests in 8 files) came from a run without `DATABASE_URL`; `handler.test.ts`, `run-data.test.ts`, `guest-preferences`, `host-outcomes` and `guest-clock` then failed only on the missing variable. Every gate run below exports `DATABASE_URL`.
