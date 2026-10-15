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
| `scripts/contract-preflight.ts` | new: refuses to continue unless the deployed AgentCore runtime version equals the release 1 record |

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
