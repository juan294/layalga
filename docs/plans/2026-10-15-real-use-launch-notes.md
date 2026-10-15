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

## Pre-existing failures found at the phase 1 baseline

VERIFIED on unchanged `develop` (`fea093b`) on 2026-10-15: `tests/e2e/guided-demo.spec.ts` (2 runs, demo clock outcome `no_eligible`) and 25 vitest tests in 8 files (`src/agent/runtime/handler.test.ts`, `src/app/api/runs/run-data.test.ts`, `src/components/host/host-outcomes.integration.test.ts`, `src/core/booking/guest-clock.integration.test.ts`, `src/core/booking/guest-preferences.integration.test.ts`, `src/core/booking/invitations.integration.test.ts`, `src/core/demo/advance-clock.integration.test.ts`, `src/core/reconfirmation/jobs.test.ts`) fail identically. They use fixed September 2026 dates (for example link expiry `2026-10-01`) mixed with database `now()`. The `Coverage` workflow stays green because it runs unit tests only.
