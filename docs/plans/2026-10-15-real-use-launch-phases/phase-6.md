# Phase 6: contract, drop the demo schema (release 2)

Parent: [plan](../2026-10-15-real-use-launch.md)

Removes the demo schema after release 1 is live on both Vercel and AgentCore.

## Entry conditions

- Phase 5 exit met; the AgentCore runtime version from release 1 is recorded.
- Phase 5 step 5 (memory forget) succeeded.

## Files

| File | Action |
| --- | --- |
| `supabase/migrations/*_drop_demo_schema.sql` (timestamp assigned by `supabase migration new`) | new |
| `src/core/data-retention.integration.test.ts` | edit: retention on a non-demo home after the contract |
| `src/core/notifications/guest-delivery.integration.test.ts` | edit: remove the `demo` fixture flag (`:27-32`, `:608-622`); its retention call at `:315` stays |
| `src/core/household-conversion.integration.test.ts` | delete (it seeds `homes.demo = true` and runs the one-shot conversion; added during phase 3) |
| `src/test-support/fixture-household.integration.test.ts` | edit: stop selecting `homes.demo` (added during phase 3 review) |
| `src/core/reconfirmation/jobs.test.ts` | edit: the global-tick test sets `homes.demo = true` to prove the column is ignored; drop that line (added during phase 3 review) |
| `scripts/forget-synthetic-memory.ts` and test, `package.json` entry | delete |
| `scripts/contract-preflight.ts` | new: refuses to continue unless the deployed AgentCore runtime version equals the release 1 record (amended 2026-10-16: the DEFAULT endpoint's live version equals the recorded version of a bundle without demo-schema reads; see the notes) |

## Step 1: contract migration

```
@ drop demo schema
ctx: Postgres
pre: no home has demo = true
do:
  1. validate: raise "demo homes still exist; apply the conversion first" when any home has demo = true
  2. write create or replace private.apply_data_retention_before_guest_delivery without the demo predicates
  3. write drop function private.restore_demo_identity_claims()
  4. write drop table public.demo_clock, public.demo_mutation_leases, public.demo_mutation_limits, private.review_access_events
  5. write alter table public.homes drop column demo
fx: grants and policies on dropped objects go with them
```

Step 2 copies the latest body (`supabase/migrations/20260905000300_guest_notes.sql:10-215`) and removes `and not home.demo` at `:32,92,140,168,186,194` and the demo-session exemption at `:78-84`. It keeps the execute revokes at `:213-215`. The outer wrapper (`20260905000500_guest_delivery.sql:49-72`) does not change.

Check whether `layalga_web_runtime` still needs `usage on schema private` (granted in `20260831001300_demo_identity_reset.sql:54`). Revoke it only if no remaining grant to that role targets a `private` object; record the grep used.

## Step 2: tests

- Migration test: on a database with a demo home, the migration fails with the stated message; after conversion it succeeds and the five objects and the column are gone.
- Retention test: after the contract, `private.apply_data_retention()` runs without error and redacts a non-demo home's rows past each threshold.

## Step 3: release 2

| # | Action | Verification |
| --- | --- | --- |
| 1 | `scripts/contract-preflight.ts` | Prints the matching runtime version or stops |
| 2 | `supabase db push --linked` (authorized) | `select column_name from information_schema.columns where table_name = 'homes' and column_name = 'demo'` returns nothing |
| 3 | Merge and tag release 2 (authorized) | `/api/health` commit |
| 4 | Dispatch the production gate (authorized) | Run passes |

## Acceptance

Automated: all plan-level checks, the migration and retention tests, and `grep -rnE "homes\.demo|home\.demo|demo_clock|demo_mutation|review_access|restore_demo_identity_claims" src scripts supabase/seed.sql` returns nothing.

Manual: the next nightly retention run (03:17) is checked once with `select * from cron.job_run_details` for the retention job and shows success.

## Implementation handoff (2026-10-15)

Status: code complete on local branch `feat/drop-demo-schema` (worktree removed after merge decisions; see the final commit on that branch). Not merged into `develop` by design: merging it before release 1 ships would let the release 1 `db push` drop `homes.demo` under the running old code.

- [x] Step 1: `supabase/migrations/20261015084815_drop_demo_schema.sql` (fail-closed guard, retention body without demo predicates, drops, `revoke usage on schema private from layalga_web_runtime`).
- [x] Step 2: `src/core/demo-schema-contract.integration.test.ts`; `src/core/data-retention.integration.test.ts` covers every threshold branch after the contract; other demo-schema test edits; `forget-synthetic-memory` and the conversion test deleted; `scripts/contract-preflight.ts` (`pnpm run contract:preflight -- --runtime-id <id> --expected-version <n>`).
- [x] Step 3 (release 2): shipped as v2.2.0 on 2026-10-16 (see the release handoff below and the playbook's v2.2.0 decision).
- Gate on the branch with the contract applied to a reset local database (commit `2aa57c6`): typecheck, lint, `test` 743 passed, `test:integration` 174 passed, coverage, build, bootstrap, `test:e2e` 25 passed, `release:probes --target local` 9 of 9 passed. The review fixes after it change only tests and docs; their targeted tests pass (5 of 5).
- To release: rebase or merge `feat/drop-demo-schema` onto `develop` after release 1, re-run the gate, then follow step 3.

## Release handoff (2026-10-16)

- Entry conditions met: release 1 shipped as v2.0.0 (runtime version 38), the synthetic memory forget ran, and v2.1.0 then moved AgentCore to version 39 (`ed6c574`), which reads none of the dropped objects (independent review).
- `develop` merged into this branch (`ef190ea`). The merge needed one repair: `scripts/release-helpers.ts` keeps the `develop` version, because `forget-orphaned-memory` needs `MEMORY_ID` and `AWS_REGION`. The preflight now reads the DEFAULT endpoint's live version (`8d8cbf8`). Both changes passed independent review.
- Gate on `27cbed8` with the contract applied to a reset local database: typecheck, lint, `test:integration` 178 passed, `test:coverage` 600 passed (56.42% statements), build, bootstrap, agent bundle, `test:e2e` 26 passed, `release:probes --target local` passed with cleanup. The acceptance grep returns only `src/core/demo-schema-contract.integration.test.ts`.
- Production read before the release: no home has `demo = true`; `demo_clock` and both demo mutation tables are empty; `private.review_access_events` holds 5 hackathon review rows (2026-10-05 to 2026-10-15), which the migration deletes; `layalga_web_runtime` holds grants in `private` only on `review_access_events` and `restore_demo_identity_claims`.
- `pnpm run contract:preflight -- --runtime-id layalga_agent-mONXXjFms4 --expected-version 39` passed; with `--expected-version 38` it stopped.
- Release (each step owner-authorized): `supabase db push --linked` applied the contract migration; pull request #203 merged as `3e433f1`; Vercel serves `3e433f1`; AgentCore DEFAULT serves version 40; production probe run 38855885750 passed; tag `v2.2.0` published.
- Open: the manual acceptance check of the next nightly retention run (03:17) in `cron.job_run_details`.
