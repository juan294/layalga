# Phase 1: real-auth test foundation

Parent: [plan](../2026-10-15-real-use-launch.md)

Browser tests stop using demo cookies and the demo seed before the demo is removed. Demo mode still exists during this phase, so CI stays green throughout.

## Files

| File | Action |
| --- | --- |
| `src/test-support/fixture-household.ts` | new: fixture household builder shared by e2e tests and release scripts |
| `src/test-support/fixture-household.integration.test.ts` | new |
| `tests/e2e/helpers/host-session.ts` | new: real local Supabase host session for Playwright |
| `tests/e2e/helpers/host-session.test.ts` | new: unit test for the local-only guard and failure message |
| `tests/e2e/host-view.spec.ts`, `mobile-guest-host.spec.ts`, `mobile-tap-targets.spec.ts`, `webmcp-registration.spec.ts`, `run-status-styling.spec.ts`, `guest-link.spec.ts` | edit: use fixtures and real sessions |
| `tests/e2e/guest-email.spec.ts`, `guest-visit-record.spec.ts` | edit: replace their inline home inserts with the builder |

No CI change: the helper reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which CI already exports from `supabase status` (`.github/workflows/ci.yml:109-118`) and Playwright already defaults (`playwright.config.ts:18-22`).

Not touched: `guest-demo-session.spec.ts` and `guided-demo.spec.ts` (deleted in phase 3 with the features they test), `tests/e2e/global-setup.ts` (still seeds the demo for those two specs until phase 3).

## Step 1: fixture household builder

Generalize the two existing patterns: `createProbeFixture` (`scripts/release-probes.ts:393-452`) and the inline home in `tests/e2e/guest-email.spec.ts:16-59`.

```
@ createFixtureHousehold(sql, opts) -> FixtureHousehold
ctx: postgres client (DATABASE_URL), LINK_TOKEN_SECRET
pre: opts.label unique per run; homes.demo defaults to false
do:
  1. write home "<label>" (Europe/Madrid), rooms, one host, parties + invitations in one tx
  2. compute link-token hashes with the app's own helper (as guest-email.spec does)
  3. return ids, raw guest tokens, room ids, and cleanup()
fx: rows under one new home only
fail: insert error -> rollback, rethrow with label
```

```
@ cleanup() -> void
do:
  1. delete agent_sessions inv_<invitation>, capture_<host>, tick_<job> for this home
  2. delete auth.users bound to this home's hosts (local only)
  3. delete home by id AND name (cascade)
  4. validate zero rows remain for the home id
```

Party names default to names the scripted model already recognises (`src/agent/scripted-model-selection.ts:88-99`), so capture flows behave as they do today. Raw messages carry a per-run tag, so `cleanupTaggedRunArtifacts` (`scripts/release-helpers.ts:250-343`) keeps working.

## Step 2: real local host session

```
@ signInAsHost(context, { sql, hostId }) -> { userId, email }
ctx: local Supabase Auth email provider; @supabase/ssr createServerClient with a capturing cookie adapter
pre: NEXT_PUBLIC_SUPABASE_URL host is 127.0.0.1 or localhost
do:
  1. validate local URL (refuse any other host)
  2. write auth user: signUp(random email, random password); confirmations are off locally (supabase/config.toml:224-229)
  3. write hosts.auth_user_id = user.id for hostId
  4. emit cookies captured from setAll into the Playwright context for APP_URL
fail: non-local URL -> throw "signInAsHost is local-only"
fail: no session -> throw "local email sign-in is disabled; check supabase/config.toml [auth.email]"
```

Cookie format comes from the installed `@supabase/ssr` 0.12.6 (`base64-` prefix, chunking above 3180 characters); capture it through `setAll` instead of encoding by hand, modelled on `src/lib/supabase/proxy.ts:11-21`. Lookup then goes through the real path, `findHostByAuthUserId` (`src/lib/auth/current-host.ts:63-74`), which needs only `hosts.auth_user_id`.

## Step 3: migrate the specs

| Spec | Today | After |
| --- | --- | --- |
| `host-view` | `createDemoHostCookie` with `…0201`; Oteros token; Vega raw message | fixture household + `signInAsHost`; fixture token; fixture raw message |
| `mobile-guest-host`, `mobile-tap-targets` | demo host cookie + Oteros token | same as above |
| `webmcp-registration` | `seedDemo` + demo host cookie + Vega token | same as above |
| `run-status-styling` | `DEMO_SEED.hosts[0]` cookie + Vega message | same as above |
| `guest-link` | `seedDemo` for the fixed Vega token | fixture token |
| `guest-email`, `guest-visit-record` | inline `demo:false` homes | builder |

Each spec creates its own household in `beforeEach` or `beforeAll` and calls `cleanup()` in the matching `after` hook.

Add one new assertion to `host-view`: a fixture household with zero rooms renders the host dashboard and its add-room path without an error. This covers the state the real household enters in phase 5.

## Acceptance

Automated:
- `pnpm run test:e2e` passes; `grep -nE "createDemo(Host|Guest)Cookie|seedDemo|DEMO_SEED" tests/e2e/*.spec.ts` matches only `guest-demo-session.spec.ts` and `guided-demo.spec.ts`.
- `fixture-household.integration.test.ts`: builder plus cleanup leaves zero rows; two concurrent builders do not collide.
- `host-session.test.ts`: a non-local URL throws the local-only message; a stubbed "no session" path throws the message that names `[auth.email]`.
- All plan-level automated checks pass.

Manual: none.

## Implementation handoff (2026-10-15)

Status: complete. Branch `feat/real-use-launch` in worktree `/Users/juan/code/layalga-real-use`, base `develop` at `fea093b`. Commits `0de6625` (implementation) and the phase 1 simplify changes folded into `b2fb8ad`.

- [x] Step 1: `src/test-support/fixture-household.ts` builds non-demo households (default three rooms, Familia Vega and The Parkers with future stays from `fixtureStay`) and removes them by id and name; auth-user deletion is opt-in (`deleteBoundAuthUsers`).
- [x] Step 2: `src/test-support/host-session.ts` (moved from `tests/e2e/helpers/` during simplify) signs a fixture host in through local Supabase Auth and installs the captured `@supabase/ssr` cookies.
- [x] Step 3: all eight specs use the Playwright `household` fixture (`tests/e2e/helpers/household.ts`); `host-view` adds the empty-household dashboard and first-room assertion.
- Review (fresh-context agent): APPROVED with 7 minor/nit findings, all fixed (opt-in auth deletion, host-binding check and user rollback, cookie origin from the Playwright base URL, guest-email setup leak, session deletion inside the cleanup transaction, confirmation-without-session test, future dates in `webmcp-registration`).
- Simplify (four angles): applied the shared Playwright fixture, `openHousehold` reuse, party defaults, `issueLinkToken` reuse, one `markerSuffix`, and the helper move that keeps both runner configurations unchanged. Skipped: multi-row inserts and a worker-scoped auth user (small local cost), converting `src/agent/testing/seed-host.ts` (outside this diff).
- Evidence: `pnpm run test:e2e` 27 passed, 2 failed (`guided-demo`, failing identically on unchanged `develop`; deleted in phase 3). Typecheck, lint, build and bootstrap passed. Deviations: see the notes file.
