# Phase 1: Scaffold, schema, core engine, policy

Days: 2026-08-30 to 2026-08-31. Depends on Phase 0's ADR (either verdict).

## Goal

A running Next.js 16 application skeleton with the full database schema,
the pure booking engine and overlap policy, success criteria 1 and 2 green,
and CI running typecheck, lint, test, and build.

## Tasks

- [ ] 1.1 Root scaffold: `pnpm init`, `package.json` with `engines.node "24.x"`, scripts `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (`vitest run`), `test:e2e` (`playwright test`), `db:start`, `db:reset`, `db:push`, `agent:bundle`. Install the pinned versions from the plan, section 6. `tsconfig.json` strict, `moduleResolution bundler`, paths `@/*`. `eslint.config.mjs` per the plan's verified flat config. `.env.example`. `vercel.json` with `functions` glob `src/app/api/**/*` `maxDuration 300`.
- [ ] 1.2 Move the Phase 0 code: `spike/agentcore/src/postgres-storage.ts` to `src/agent/storage/postgres-storage.ts`, the entrypoint shape to `src/agent/runtime/agentcore.ts` (stubbed until Phase 2), delete `spike/`, drop `spike_holds` in the Phase 1 migration.
- [ ] 1.3 Migrations under `supabase/migrations/` implementing the plan's section 7 exactly: `20260831000000_extensions.sql` (`btree_gist`), `20260831000100_core.sql` (homes, rooms, hosts, parties, invitations, visits, visit_rooms with the EXCLUDE constraint, indexes, RLS), `20260831000200_agent.sql` (pending_decisions, runs, audit_events), `20260831000300_scheduling.sql` (scheduled_jobs, notifications, demo_clock). Apply locally, verify with `psql` that the EXCLUDE constraint exists, then `supabase db push`.
- [ ] 1.4 `src/core/db/schema.ts` (drizzle tables mirroring the SQL; `daterange` via `customType`), `src/core/db/client.ts` (`postgres(DATABASE_URL, { prepare: false, max: 4 })`, `drizzle(sql)`).
- [ ] 1.5 `src/core/clock.ts`: `interface Clock { now(): Date }`, `SystemClock`, `FakeClock` (test), `DbDemoClock(homeId)` reading `demo_clock` when enabled and falling back to system time.
- [ ] 1.6 `src/core/policy/allocate-rooms.ts` and `evaluate-overlap.ts` per the plan's section 9, with the truth-table test (criterion 1).
- [ ] 1.7 `src/core/booking/holds.ts`: `createTemporaryHold(db, clock, input)` transaction: `select ... from homes where id = $1 for update`, load overlapping visits, `evaluateOverlap` (defensive re-check; the hook is the gate, but the engine refuses `deny` too), insert `visits` and `visit_rooms`, map `23P01` exclusion violations to `RoomUnavailableError`. `confirmVisit`, `cancelVisit`, `rescheduleVisit` (delete and re-insert `visit_rooms` inside one transaction).
- [ ] 1.8 `src/core/booking/invitations.ts`: `captureInvitation`, `issueLinkToken` (32 random bytes, base64url, stored hashed with `LINK_TOKEN_SECRET` HMAC; the raw token only appears in the generated link), `findInvitationByToken`.
- [ ] 1.9 Concurrency test (criterion 2) against the local stack.
- [ ] 1.10 `supabase/seed.sql` and `scripts/seed-demo.ts` with the plan's section 11 values, idempotent (delete the demo home by name, re-insert).
- [ ] 1.11 `src/app/api/health/route.ts`: checks `select 1`, counts `homes`, returns `{ status: 'ok' | 'degraded', commit: process.env.VERCEL_GIT_COMMIT_SHA }`; logs `[TABLE_FALLBACK]` at error level if a table is inaccessible.
- [ ] 1.12 CI: replace `.github/workflows/ci.yml` job with `pnpm install --frozen-lockfile`, `bash scripts/verify-bootstrap.sh`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit` (no database), `pnpm run build`. Integration tests run in a second job with `supabase/setup-cli` and `supabase start`. Update `scripts/verify-bootstrap.sh` so it no longer fails on the presence of application files.
- [ ] 1.13 README status section updated to "application scaffold, Phase 1".

## Truth table for criterion 1 (`evaluate-overlap.test.ts`)

Fixture home: rooms 2, 2, 3; `pets_together_allowed` false. Existing visit
E: stay 09-18 to 09-21, 2 adults, 2 children, 0 pets, rooms Teixu and Horreu.

| Case | Draft | Expected |
|---|---|---|
| no overlap, any party, no requests | stay 09-25 to 09-27 | allow |
| no overlap, special request | same, requests ["ground floor"] | interrupt(special_request) |
| beds fit, no children, no pets | 09-19 to 09-21, 2 adults | allow, rooms [Fonte] |
| beds do not fit | 09-19 to 09-21, 3 adults | deny(beds) |
| children while E has children | 2 adults 1 child | deny(children) |
| pets while E has none | 2 adults 1 pet | allow |
| pets while E has pets (E variant with 1 pet), together false | 2 adults 1 pet | deny(pets) |
| pets while E has pets, together true | same, home flag true | allow |
| beds fail and special request | 3 adults, requests | deny(beds) (deny precedes interrupt) |
| children fail and special request | 2 adults 1 child, requests | deny(children) |
| fits and special request | 2 adults, requests | interrupt(special_request) with allocation [Fonte] |
| reschedule of E itself excluded | draft.visitId = E, 2 adults 2 children | allow (E not counted against itself) |
| hold status counts as overlapping | E status hold | as above |
| cancelled does not count | E status cancelled | allow |

The test enumerates the eight combinations of (beds ok, children ok, pets ok)
programmatically plus the request flag, asserting the precedence rule, and
adds the named cases above.

## Concurrency test (criterion 2)

```
seed: home H with one room R (2 beds); parties P1, P2; invitations I1, I2
const stay = ['2026-10-02', '2026-10-04']
const [a, b] = await Promise.allSettled([
  createTemporaryHold(db, clock, { invitationId: I1, stay, adults: 2 }),
  createTemporaryHold(db, clock, { invitationId: I2, stay, adults: 2 }),
])
expect(fulfilledCount(a, b)).toBe(1)
expect(rejectedWith(a, b, RoomUnavailableError)).toBe(1)
expect(await db.select().from(visitRooms)).toHaveLength(1)
```

Run 20 iterations with fresh seeds to exercise both the `FOR UPDATE`
serialization and the EXCLUDE constraint (the test also runs once with the
advisory lock disabled to prove the constraint alone rejects the second
insert).

## Verification

Sequential: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`,
`pnpm run build`, `bash scripts/verify-bootstrap.sh`. Then
`supabase db push` applied, `pnpm run seed:demo` against local and remote.

## Exit criteria

- Criteria 1 and 2 green locally and in CI.
- Remote Supabase has the schema and the demo seed.
- `pnpm run build` succeeds; Vercel preview build for the PR succeeds (the
  ignore step becomes a no-op once `package.json` exists; the preview is not
  the production URL and needs no authorization).

STOP and wait for confirmation.
