# Phase 3: remove demo mode from the application

Parent: [plan](../2026-10-15-real-use-launch.md)

The application stops reading `DEMO_MODE` and `homes.demo`. Google becomes the only sign-in. One migration converts the production household in place. The demo schema stays in the database until phase 6, so the deployed old code and the old AgentCore bundle keep working during the release window.

Work in this order inside one worktree; each step ends with `pnpm run typecheck` and the affected unit tests.

## Step 1: sign-in and authentication

| File | Change |
| --- | --- |
| `src/app/[locale]/sign-in/page.tsx` | Remove `DEMO_MODE`, the demo host and invitation queries (`:36-63`) and the two forms (`:83-110`); always render `SignInButton` |
| `src/app/[locale]/sign-in/page.test.tsx` | Replace the two mode tests (`:66-92`) with: Google renders; no `demo-enter-*`; `error=not_a_host` renders the error next to the Google button |
| `src/lib/auth/current-host.ts` | Remove the demo cookie fallback (`:41-45`), `findDemoHostById` (`:76-79`) and `HostRecord.demo` (`:19,27,66,89,103`) |
| `src/lib/auth/current-guest.ts` | Remove the demo guest fallback (`:37-57`) |
| `src/lib/auth/guest-email-session.ts` | Stop deleting the demo guest cookie (`:7,21`) |
| `src/app/auth/sign-out/route.ts` | Stop clearing demo cookies (`:3,29-41`); keep Supabase and guest-email cookies |
| Delete | `src/lib/auth/demo-session.ts`, `demo-mutation.ts`, `src/lib/review-access.ts`, `src/app/[locale]/(host)/demo-enter/`, `src/app/[locale]/demo-enter-guest/`, `src/app/api/demo/`, `scripts/review-access.ts` and every matching test |
| `package.json` | Remove `review:access` |

New test: `getCurrentHost` with only a `layalga_demo_host` cookie and no Supabase user returns null.

## Step 2: clock

- Delete `DbDemoClock`, `DemoClockStore`, `DemoClockSource` and `readDemoClock` (`src/core/clock.ts:36-97`). Keep `Clock`, `SystemClock`, `FakeClock`.
- Runtime callers take `SystemClock` or an injected `Clock`: `src/agent/runtime/deps.ts:24`, `src/core/booking/guest-actions.ts:90,249`, `src/components/host/host-outcomes.tsx:26`, `src/components/host/guest-delivery-panel.tsx:20`, `src/components/guest/load-guest-invitation-defaults.ts:17`.
- `src/core/booking/guest-invitation.ts:116-136`: replace `coalesce(dc.now, now())` and the `demo_clock` join with a `now` parameter from the caller's clock, so `FakeClock` tests keep control of time.
- `src/app/[locale]/(host)/host-context.ts:13-41`: remove `demoNow`; `(host)/page.tsx`, `calendar/page.tsx:36-38` and `rooms/page.tsx:20-23` use the current time.
- Delete `src/core/demo/` and `clockInputToIso` (`src/components/frontend-utils.ts:138-141`); keep `clockInputValue`.
- Update the clock tests listed in the plan's consumer sweep.

## Step 3: domain branches on `homes.demo`

```
@ schedulerForHome() -> Scheduler   (was schedulerForHome({ homeDemo }))
do:
  1. parse server environment
  2. return configured scheduler (Noop when SCHEDULER=none)
```

- Update callers and drop their `select demo` queries: `deps.ts:18-25`, `guest-actions.ts:245-253,295-306`, `visits/actions.ts:31-58`, `(host)/actions.ts:264-276`; update `scheduler/index.test.ts:120-132`, `deps.test.ts`, `cancellation-actions.test.ts`, `g/[token]/actions.test.ts`.
- Tick filters: remove the `homes.demo = false` clauses (`src/core/booking/holds.ts:394-400`, `src/core/reconfirmation/jobs.ts:634-640`); update `jobs.test.ts:190-202` to assert that every home is dispatched.
- Guest notifications: remove the `demo` status from `GuestDeliveryStatus` (`guest-outbox.ts:40`) and `GuestContactState` (`guest-contact.ts:16`), its producers (`guest-outbox.ts:61,79,322`; `guest-contact.ts:40,143,165,215,245,283`) and consumers (`guest-delivery-panel.tsx:28-67`, `guest-email-preferences.tsx:77-83`, `guest/email-actions.ts:61`).
- Link-token expiry: remove `home.demo or` from the authority query (`guest-contact.ts:184-188`). New unit test: an expired token on any home is rejected.
- `src/core/db/schema.ts`: remove `demo` (`:89`) and the `demo_clock` table (`:569-575`). The columns stay in the database until phase 6; inserts rely on the column default.

## Step 4: demo UI and copy

- Delete `src/components/host/{demo-clock-panel,demo-season-sync,demo-zone,guided-demo-panel,guided-demo-start}.tsx` (+ `guided-demo-start.test.ts`) and `src/components/guest/demo-guest-guide.tsx`.
- `src/app/[locale]/(host)/layout.tsx:39-58`: remove the synthetic data banner. `(host)/page.tsx:2,24-26,226,314-352`: remove `DemoSeasonSync` and `DemoZone`.
- `src/components/guest/guest-shell.tsx:4,26,55-105`: remove the demo band and `showDemo`/`demoGuide` props; update `guest/page.tsx:9,55-110` and `g/[token]/page.tsx:8,73-160`.
- `src/components/guest/guest-ledger.module.css:336-356`: remove `.demoGuide`.
- `messages/en.json` and `messages/es.json`: remove `DemoHost`, `Host.demo`, `Host.demoZone`, `GuestDeliveryHost.statuses.demo`, `GuestEmail.demo`, `GuidedDemo`, `DemoGuestGuide`. Keep `Runs.outcomes`.
- Update `frontend-remediation.test.tsx:34-42,130-132` and `frontend-boundaries.test.tsx:27,88-90`.
- Delete `tests/e2e/guest-demo-session.spec.ts`, `tests/e2e/guided-demo.spec.ts` and `tests/e2e/global-setup.ts`; remove `globalSetup`, `DEMO_MODE` and `DEMO_SESSION_SECRET` from `playwright.config.ts:11-27`.
- New `tests/e2e/sign-in.spec.ts`: the sign-in page shows `google-sign-in` and no `demo-enter-*` control; `POST /en/demo-enter`, `POST /en/demo-enter-guest` and `POST /api/demo/reset` return 404.

## Step 5: scripted model is test-only

```
@ parseServerEnvironment(env) MODEL rule   (src/lib/server/env.ts:90-95, 247-253)
do:
  1. parse MODEL as today
br: production && MODEL=scripted -> throw "MODEL=scripted is test-only; set MODEL=bedrock"
```

- Move the `MODEL=scripted` branch out of `runtimeDeps` (`src/agent/runtime/deps.ts:8,30-31`) into a local-only wrapper used by `src/agent/runtime/local.ts`, `src/agent/client.ts` and `src/app/api/agent/run/route.ts`. `src/agent/runtime/handler.ts` (AgentCore) keeps using `runtimeDeps` alone.
- `scripts/build-agent-bundle.sh:23-42`: after the build, read `result.metafile.inputs` and fail with `scripted model must not ship in the AgentCore bundle` when any input path contains `scripted-model`.
- Tests: env refuses scripted in production and accepts it in development and test; the bundle check fails on a stub metafile that lists `scripted-model.ts`.
- Run `pnpm run build` with the CI environment to confirm that the production refusal is not triggered at build time.

## Step 6: conversion migration and local seed

New migration `supabase/migrations/*_convert_household_to_real_use.sql` (timestamp assigned by `supabase migration new`):

```
@ convert household 00000000-0000-4000-8000-000000000001
ctx: Postgres; runs once
pre: home exists with demo = true (production), or is absent (fresh local database before seed)
do:
  1. lookup home where demo = true; skip when absent
  2. write deletes: agent_sessions inv_<invitation>, capture_<host>, tick_<job> of the home
  3. write deletes: runs, audit_events, pending_decisions, notifications, host_email_pings, room_action_proposals, private_room_blocks of the home
  4. write deletes: parties (cascades invitations, visits, guest contacts, jobs), rooms (cascades), demo_clock and demo_mutation_leases rows of the home
  5. write homes.demo = false
fx: keeps homes row, hosts, host_identity_claims, calendar_feeds, host_notification_settings
risk: deletes demo-reviewer activity created before release; all of it is synthetic
```

Foreign keys verified in planning: every child key into parties, invitations and rooms cascades; hosts are not deleted, so the restricting keys on hosts (`20260831083526_agent_first_room_coordination.sql:84,114,165,193`) do not fire.

`supabase/seed.sql`: rewrite as a local development household. Keep the home, three rooms, both hosts and both `host_identity_claims` rows (inserted directly instead of calling `private.restore_demo_identity_claims()`, `:98`). Remove the demo flag, parties, invitations and the `demo_clock` row.

Migration test (integration): on a database seeded with the old demo shape, the migration leaves the home with `demo = false`, zero parties, rooms and runs, and the hosts and claims unchanged. On a database without the home, it is a no-op.

Delete `src/lib/demo/reset.ts` and test, `scripts/seed-demo.ts` and test, and their `package.json` entries (`:18,25`). Convert `scripts/seed-memory.ts` to `scripts/forget-synthetic-memory.ts`: keep only the forget path, with the Vega and Parker actor ids inlined, and replace the `seed:memory` package script with `forget-synthetic-memory`, so phase 5 can run it against production.

## Step 7: environment and configuration

- `.env.example:38-40`: remove `DEMO_MODE` and `DEMO_SESSION_SECRET`.
- `.github/workflows/ci.yml:79,83`: remove both.
- `.env.development.local` is local and gitignored; note the removal in the phase report instead of editing it.

## Acceptance

Automated:
- All plan-level automated checks pass, including `test:integration`, `test:e2e` and `release:probes --target local`.
- `grep -rnE "DEMO_MODE|DEMO_SESSION_SECRET|demo-enter|DbDemoClock|DEMO_SEED|resetDemoHome|review_access|homeDemo|GuidedDemo|DemoZone" src scripts tests .github playwright.config.ts .env.example messages` returns only the 404 checks in `tests/e2e/sign-in.spec.ts`.
- `scripts/build-agent-bundle.sh` passes its new metafile check (no input path contains `scripted-model`).
- The new tests named in steps 1, 3, 5 and 6 pass.

Manual: open the local host dashboard after `supabase db reset` and signing in through `signInAsHost`. Check it in light and dark themes with no demo banner and no demo zone, then open a guest token page. Green checks do not prove appearance.
