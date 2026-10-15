# Demo mode surfaces and Google sign-in

- Date: 2026-10-15
- Repository: `layalga`
- Branch: `develop` at `185b7d5` (local `develop` is 3 commits ahead of `origin/develop`; the untracked `docs/research/2026-10-15-agents-for-humans-winners-assessment.md` belongs to another session and was not read or changed)
- Workflow: `rpi-research` (descriptive; no product code, configuration or remote state changed)

## Research question

Which parts of L’Ayalga exist only for the hackathon demo (synthetic sessions and entry, demo clock, guided flows, seed data, review-access ledger, scripted model, demo end-to-end tests and release probes, CI and documentation), and how does Google sign-in work today, including how it was hidden? The answer supports a plan that removes demo mode and restores Google sign-in for real household use.

## Summary

Demo mode has two independent switches. The `DEMO_MODE === "true"` environment check controls the user interface and authentication: it hides the Google button on the sign-in page and enables the signed demo cookies and demo API routes. The database column `homes.demo` controls domain behaviour: demo homes get no real scheduler, no guest email, no minute-tick hold expiry or job dispatch, a database-backed demo clock, and a link-token expiry bypass. Removing the environment flag alone leaves the second switch in place.

Google sign-in is hidden, not removed. The OAuth flow (`/auth/prepare`, Supabase `signInWithOAuth`, `/auth/callback`, host identity claims) is intact and ungated. Only the main sign-in page suppresses the button when `DEMO_MODE` is on. The Google button still renders on the invitation claim page and the guest visits page in every mode.

Production (VERIFIED on 2026-10-15) has `DEMO_MODE` and `DEMO_SESSION_SECRET` defined in Vercel, shows only "Enter as Host" and "Enter as Guest" on the live sign-in page, and has Google enabled in hosted Supabase Auth. The production database holds exactly one home, the demo home `00000000-0000-4000-8000-000000000001` with `demo = true`. The two real host identities are bound to host rows inside that demo home. A real Google sign-in therefore lands in the synthetic household.

## Production observations (VERIFIED, 2026-10-15)

| Fact | Evidence |
| --- | --- |
| Vercel production defines `DEMO_MODE` and `DEMO_SESSION_SECRET` (values not decrypted) | `vercel env ls production` (names only) |
| Live sign-in page renders "Enter as Host" and "Enter as Guest", which post to `/en/demo-enter` and `/en/demo-enter-guest`; no Google button | `curl https://layalga.thecreativetoken.com/en/sign-in` |
| Hosted Supabase Auth: `external.google = true`, `external.email = true`, `disable_signup = false` | `GET {SUPABASE_URL}/auth/v1/settings` with the publishable key |
| One home in production: `…0001`, `demo = true`, 2 hosts (1 linked to an auth user), 3 rooms, 2 parties, 2 invitations, 0 visits, 1 `demo_clock` row | Read-only `select` through the Supabase MCP, counts only |
| 2 `host_identity_claims` rows (1 bound), 1 `auth.users` row, 0 parties linked to auth users | Same, counts only |
| `private.review_access_events`: 5 rows, latest `2026-10-15 06:20:15 UTC` | Same, counts only |
| Last `production-probes.yml` runs: 2026-09-12 success, 2026-09-11 success, 2026-09-11 failure; each title says it resets synthetic demo data | `gh run list --workflow production-probes.yml -L 3` |

## Detailed findings

### 1. Google OAuth flow (intact)

1. `SignInButton` posts `{next}` to `/auth/prepare`, then calls `supabase.auth.signInWithOAuth({ provider: "google", redirectTo: origin + "/auth/callback" })` (`src/app/[locale]/sign-in/sign-in-button.tsx:23-47`, call at `:36-41`).
2. `/auth/prepare` rejects cross-origin requests (`src/app/auth/prepare/route.ts:7-9`), sanitizes `next` with `safeNextPath` (`:14`) and sets the httpOnly `layalga_oauth_next` cookie for 10 minutes (`:20-26`; name at `src/lib/auth/oauth-next.ts:5`).
3. `/auth/callback` exchanges the code and reads the user (`src/app/auth/callback/route.ts:17-21`). It then claims a party for `/{locale}/g/<token>` (`:23-28`), redirects an existing party user to `/{locale}/visits` (`:29-33`), or calls `claimHostForUser` (`:34-42`). On no match it signs out (`:44`) and redirects with `claim=failed`, `account=not_found` or `/sign-in?error=not_a_host` (`:45-55`); an exchange error gives `error=oauth_failed` (`:59`).
4. `src/proxy.ts:43-46` refreshes the Supabase session through `src/lib/supabase/proxy.ts:23`; the matcher excludes `api` and `auth` (`src/proxy.ts:53`). There is no `src/middleware.ts`.
5. Local Supabase config enables Google with `GOOGLE_OAUTH_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` (`supabase/config.toml:340-345`) and allows the production callback URL (`:162-166`). `.env.example:7-8` lists both variables.
6. Neither `/auth/prepare` nor `/auth/callback` checks `DEMO_MODE`.

Host provisioning is an allow-list. `public.host_identity_claims` (`supabase/migrations/20260831001100_secure_invitation_identity.sql:70-84`) maps a normalized email to a host and home. `claimHostIdentity` (`src/lib/auth/host-identity.ts:5-63`, called from `src/lib/auth/current-host.ts:54-61`) locks the claim row, checks for conflicts, sets `hosts.auth_user_id` and stamps the claim in one transaction. An email without a claim row gets `not_a_host`. There is no self-service household creation.

### 2. How Google was hidden

- `src/app/[locale]/sign-in/page.tsx:36` reads `DEMO_MODE`; `:82` renders `{!demoMode ? <SignInButton locale={locale} /> : null}`. In demo mode `:37-63` selects the first demo host and a demo invitation, and `:83-110` render the two demo entry forms.
- `src/app/[locale]/sign-in/page.test.tsx:66-81` asserts no `google-sign-in` in demo mode; `:83-92` asserts Google only outside demo mode.
- Introduced in commit `57aedf1` (2026-09-04, "feat(demo): add signed guest session entry"). The plan states the hide was for the hackathon period and reused `DEMO_MODE` (`docs/plans/2026-09-04-demo-guest-session.md:8-17`, `:31-33`, `:119-121`). No document records when to reverse it.
- The Google button is not gated on `src/app/[locale]/g/[token]/page.tsx:128-133` or `src/app/[locale]/visits/page.tsx:52-57`.

Earlier history: `8799ceb` (2026-08-30) showed Google plus one demo button per host; `bc5ed55` added `/auth/prepare`; `b302c17` added `host_identity_claims`.

### 3. Demo sessions and entry

- `src/lib/auth/demo-session.ts`: cookies `layalga_demo_host` and `layalga_demo_guest`, 12-hour max age (`:3-6`); token `v1.<payload>.<HMAC-SHA256>` (`:32-40`, `:158-162`); verification with `timingSafeEqual` and expiry (`:60-89`); `DEMO_SESSION_SECRET` must be at least 32 bytes (`:164-168`).
- Entry routes, both 404 unless `DEMO_MODE` is on: `src/app/[locale]/(host)/demo-enter/route.ts:22` (host must belong to a demo home, `:33-39`; records a review session, `:41-44`; sets the cookie, `:50-60`) and `src/app/[locale]/demo-enter-guest/route.ts:23` (invitation on a demo home, `:34-42`; deletes `layalga_guest_email`, `:53`; sets the cookie, `:54-64`).
- Readers: `getCurrentHost` falls back to the demo cookie only when `DEMO_MODE` is on and the host's home is demo (`src/lib/auth/current-host.ts:41-45`, `:76-79`). `getCurrentGuestInvitation` does the same for guests after the `layalga_guest_email` capability (`src/lib/auth/current-guest.ts:20-57`).
- `src/lib/auth/demo-mutation.ts` provides authorization, rate limits and leases backed by `public.demo_mutation_leases` and `public.demo_mutation_limits` (`supabase/migrations/20260831001000_demo_mutation_control.sql:1-20`).
- Sign-out clears both demo cookies (`src/app/auth/sign-out/route.ts:29-41`); `src/lib/auth/guest-email-session.ts:7,21` deletes the demo guest cookie.

### 4. Review-access ledger

- Table `private.review_access_events` with runtime-only select and insert policies (`supabase/migrations/20260914061319_review_access_events.sql:1-33`; comment "public demo entry" at `:33`).
- Writer `startReviewSession` (`src/lib/review-access.ts:12-35`) skips requests carrying `x-layalga-automated-review: 1` (`:8`, `:21`). Its only callers are the two demo entry routes. Google sign-ins are not recorded.
- Reader `scripts/review-access.ts:65-80` (`pnpm review:access`, `package.json:32`), which reads `DATABASE_URL` from `.env.production.local`.

### 5. Domain behaviour keyed on `homes.demo` (not environment-gated)

- Column: `supabase/migrations/20260831000100_core.sql:8`; schema `src/core/db/schema.ts:89`.
- Scheduler: `schedulerForHome` returns `NoopScheduler` for demo homes (`src/agent/scheduler/index.ts:122-129`). Callers: `src/agent/runtime/deps.ts:25`, `src/core/booking/guest-actions.ts:253,306`, `src/app/[locale]/visits/actions.ts:31-58`, `src/app/[locale]/(host)/actions.ts:264-276`.
- Minute tick: without a `homeId`, hold expiry and job dispatch only select non-demo homes (`src/core/booking/holds.ts:394-400`, `src/core/reconfirmation/jobs.ts:634-640`). In production the only home is demo, so `/api/ticks` (`vercel.json` cron) currently expires no holds and dispatches no jobs for it.
- Guest email: demo homes get status `demo` and never send (`src/core/notifications/guest-outbox.ts:40,61,79-82,322`; `src/core/notifications/guest-contact.ts:16,40,143,165,215,245,283`). UI handling: `src/components/guest/guest-email-preferences.tsx:80-83`, `src/app/[locale]/guest/email-actions.ts:61`, `src/components/host/guest-delivery-panel.tsx:50`.
- Link-token expiry bypass: the authority query accepts `home.demo` without checking `link_token_expires_at` (`src/core/notifications/guest-contact.ts:184-188`).
- Data retention: `private.apply_data_retention` branches on `home.demo` (latest definition in `supabase/migrations/20260905000300_guest_notes.sql:10,32,83`; earlier in `20260831001100…:262-387` and `20260904000100…:66-137`).
- Room backfill defaults differ for demo homes (`supabase/migrations/20260831083526_agent_first_room_coordination.sql:13-24`).

### 6. Clock

- `SystemClock` (`src/core/clock.ts:7`) is the real clock; `/api/ticks` uses it (`src/app/api/ticks/route.ts:4,20`).
- `FakeClock` (`src/core/clock.ts:13-34`) is test infrastructure; its only non-test user is `src/agent/test-support/resume-child.ts:3,27`.
- `DbDemoClock` (`src/core/clock.ts:36-97`) reads `public.demo_clock` (`supabase/migrations/20260831000300_scheduling.sql:27-31`) and returns the stored time only when the row is enabled and the home is demo. Runtime callers: `src/agent/runtime/deps.ts:24`, `src/core/booking/guest-actions.ts:90,249`, `src/components/host/host-outcomes.tsx:26`, `src/components/host/guest-delivery-panel.tsx:20`, `src/components/guest/load-guest-invitation-defaults.ts:17`, `src/app/api/demo/clock/route.ts:50`.
- Raw SQL also reads `demo_clock`: `src/core/booking/guest-invitation.ts:116-136` uses `coalesce(dc.now, now())` with `dc.enabled` but without a `homes.demo` check; `src/app/[locale]/(host)/host-context.ts:13-41` provides `demoNow` to `(host)/page.tsx:65-71,217-226`, `calendar/page.tsx:36-38` and `rooms/page.tsx:20-23`.
- `src/core/demo/advance-clock.ts` (used only by `/api/demo/clock`) upserts `demo_clock` and runs the next due job.

### 7. Demo API routes and UI

- `src/app/api/demo/clock/route.ts:19` and `src/app/api/demo/reset/route.ts:16-65`: `DEMO_MODE`-gated; reset also requires the fixed demo home id and calls `resetDemoHome()`.
- `src/app/[locale]/(host)/layout.tsx:39-58`: "Synthetic demo data" banner when `DEMO_MODE` and `host.demo`.
- `src/app/[locale]/(host)/page.tsx:24-26,226,314-352`: `DemoSeasonSync` and a `DemoZone` holding `GuidedDemoPanel` and `DemoClockPanel`.
- Demo-only components: `src/components/host/demo-clock-panel.tsx` (posts to `/api/demo/clock` at `:75`), `demo-season-sync.tsx`, `demo-zone.tsx` (also imported by `src/components/guest/guest-shell.tsx:4`), `guided-demo-panel.tsx` (renders only for `DEMO_SEED.home.id`), `guided-demo-start.tsx` (reset then guest entry; Vega and Otero/"Parker" scenarios), `src/components/guest/demo-guest-guide.tsx` (styles `guest-ledger.module.css:336-356`).
- Guest pages: `src/components/guest/guest-shell.tsx:26,55-105`; `src/app/[locale]/guest/page.tsx:9,55-110` and `src/app/[locale]/g/[token]/page.tsx:8,73-160` set `showDemo = DEMO_MODE && home.demo`.
- `src/components/frontend-utils.ts:141` has a demo-clock error string.
- i18n: `messages/en.json` and `messages/es.json` each hold 47 demo keys (`DemoHost.*`, `GuidedDemo.*`, `DemoGuestGuide.*`, `Host.demo.*`, `Host.demoZone.tag`, `GuestDeliveryHost.statuses.demo`, `GuestEmail.demo`).

### 8. Model selection

- `MODEL` is `scripted | bedrock`, defaulting to `scripted` outside production and required in production (`src/lib/server/env.ts:6,90-95,247-253`). `DEMO_MODE`, `DEMO_SESSION_SECRET` and the Google variables are not validated in `env.ts` (`:20-25`, `:124-141`).
- `src/agent/runtime/deps.ts:30-31` selects `scriptedModelForTask` when `MODEL=scripted`; otherwise `bedrockModel()` (`src/agent/agent.ts:74-84`). The scripted model ships in the AgentCore bundle through the static import.
- `src/agent/scripted-outcomes.ts:1-30` defines outcome keys used by the run-status UI (`src/components/runs/run-status-poller.tsx:8,237`).
- `ScriptedModel` (`src/agent/scripted-model.ts`) is used by about 19 test files. CI and Playwright set `MODEL=scripted` (`.github/workflows/ci.yml:83-86`, `playwright.config.ts:24-27`).

### 9. Seed and reset

- Migrations create demo schema but insert no demo rows. Demo rows come from `supabase/seed.sql` (home `:11-25`, hosts `:84-96`, claims restore `:98`, parties `:100-123`, clock `:175-179`) and `resetDemoHome()` in `src/lib/demo/reset.ts` (fixed ids `:9-50`, host emails `:63,69`, parties `:94-101`, delete scope `:190-195`, claims restore `:259`, clock `:321`).
- `private.restore_demo_identity_claims()` is redefined three times; the latest (`supabase/migrations/20260831001700_restore_real_host_identities.sql:177-300`) binds the two real operator Google accounts to host rows `…0201` and `…0202` in demo home `…0001` (`:206-213`) and runs only when that demo home exists (`:1-16`, `:292-300`).
- Scripts: `scripts/seed-demo.ts:8-13` (`seed:demo`, `package.json:25`), `scripts/seed-memory.ts:19-41,88` (`seed:memory`, `:26`; writes AgentCore Memory events for the Vega party), `scripts/demo-e2e.ts` (`demo:e2e`, `:30`), `scripts/agentcore-smoke.ts:45-98` (targets `DEMO_SEED`), `scripts/benchmark-coordination.ts:77,260-265,341-446`.

### 10. Tests, release probes and CI

- Playwright forces `DEMO_MODE=true` (`playwright.config.ts:24`) and seeds the demo in global setup (`tests/e2e/global-setup.ts:1-10`). Demo-dependent specs: `guest-demo-session`, `guided-demo`, `host-view`, `mobile-guest-host`, `mobile-tap-targets`, `run-status-styling`, `webmcp-registration`, `guest-link`. Most use `createDemoHostCookie`. `guest-email.spec.ts:24` and `guest-visit-record.spec.ts:37` create `demo = false` homes but still run under the demo seed and server.
- About 60 test or spec files reference demo, synthetic, guided or Parker.
- `scripts/release-probes.ts` (nine probes, asserted at `:229`): probe 1 (health) and probe 4 (concurrent conflict on a throwaway `demo = false` home, `:393-449`) do not use demo data. Probes 2, 3, 5, 6 and 7 consume `runDemoE2E` output and `DEMO_SEED` (`:93-186`). Probe 8 checks that "Familia Vega" does not leak (`:676`). Probe 9 cleans up and re-seeds the demo home (`:202-224`).
- `.github/workflows/ci.yml:72-85` sets `DEMO_SESSION_SECRET` and `DEMO_MODE=true`; `:120-142` run `test:e2e`, `demo:e2e` and `release:probes`.
- `.github/workflows/production-probes.yml` requires the input `RESET DEMO DATA` (`:1-16`, `:37-40`) and runs `demo:e2e` then `release:probes --expect-runtime agentcore` against production with environment `production-probes` secrets.
- `vercel.json` has no demo settings. `scripts/deploy-agentcore.sh:119` has a comment about demo sampling.

### 11. Documentation

Current documents that describe demo mode as present behaviour: `README.md:36-45,157-170,185-217`; `CLAUDE.md:31,45,72,77,94`; `CONTRIBUTING.md:27`; `docs/guides/host-manual.md:9-15,75-79`; `docs/guides/guest-manual.md:22`; `docs/security/data-lifecycle.md:48,52`; `docs/release/e2e-pro-playbook.md:23-208`; `docs/release/runtime-database-and-identity.md:102`; `docs/release/guest-email-readiness.md:15`; `docs/architecture/README.md:61`; `docs/roadmap.md:16-26`; `.env.example:38-40`. Hackathon submission documents (14 of 15 files in `docs/submission/`) describe the judged demo. Dated `docs/research/` and `docs/plans/` files are historical.

## Coverage and method

Three read-only agents covered (a) authentication, (b) runtime surfaces and (c) data, tests, CI and docs. The parent re-read the decisive lines: `sign-in/page.tsx:28-40,78-86`, `current-host.ts:38-46,74-80`, `guest-contact.ts:182-190`, `guest-invitation.ts:116-136`, `scheduler/index.ts:120-130`, `holds.ts:394-400`, `jobs.ts:634-640`, `guest-outbox.ts:36-44,76-82` and `20260831001700…:1-16,286-300`. Other `file:line` citations come from agent reads and were not each re-opened by the parent.

## Unresolved questions

1. The production value of `DEMO_MODE` is inferred to be `true` from the live sign-in page; the encrypted value was not read. The production value of `MODEL` was not read; `.env.agentcore` sets `bedrock` for AgentCore.
2. Whether the Google OAuth client in Google Cloud still has the production callback configured and is in production publishing status (not testing). Hosted Supabase reports Google enabled, but no end-to-end Google sign-in was attempted.
3. Whether the real household should reuse home `…0001` (flip `demo` to false and replace synthetic rooms and parties) or be a new home. The two real host identities are bound to `…0001`; deleting that home would remove them.
4. Whether `demo_clock` rows can exist for non-demo homes; `guest-invitation.ts:116-136` would honour an enabled row without a `homes.demo` check.
5. Whether the AgentCore Memory store holds synthetic Vega and Parker preferences from `seed:memory` in production.
6. Which release verification replaces probes 2, 3, 5, 6, 7 and 9, which today depend on the demo seed and demo sessions.

## Handoff

- Objective: remove demo mode and restore Google sign-in for real use (user request, 2026-10-15). This artifact completes the research phase only.
- Approved scope so far: research. Planning, implementation, production database changes, Vercel environment changes, deployment and AgentCore changes are not yet authorized.
- Base: `develop` at `185b7d5`, worktree `/Users/juan/code/layalga`. Revalidate the baseline before planning, because local `develop` is ahead of `origin/develop`.
- Next phase: `rpi-plan`, which must decide items 3 and 6 above and whether the scripted model stays as test-only infrastructure.
