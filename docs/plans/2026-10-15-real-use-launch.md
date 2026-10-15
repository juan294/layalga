# Plan: remove demo mode and restore Google sign-in for real use

Date: 2026-10-15
Status: proposed
Research: [demo mode surfaces and Google sign-in](../research/2026-10-15-demo-mode-removal-and-google-login.md)
Base: `develop` at `fea093b` (local `develop` is 4 commits ahead of `origin/develop`)

## Why this plan exists

The hackathon judging ended on 2026-10-14. L’Ayalga still runs as a public demo: the live sign-in page offers only "Enter as Host" and "Enter as Guest", Google sign-in is hidden behind `DEMO_MODE` (`src/app/[locale]/sign-in/page.tsx:82`), and the only production household is the synthetic demo home. The owner wants the product prepared for real household use: no demo mode, Google sign-in restored, and the real household ready to receive real data.

## Accepted decisions (owner, 2026-10-15)

| Decision | Choice |
| --- | --- |
| Household | Convert home `00000000-0000-4000-8000-000000000001` in place: set `demo = false`, delete synthetic parties, invitations, rooms and the demo clock row. Keep hosts `…0201`/`…0202` and their `host_identity_claims`. The owner then enters real rooms in the app. |
| Verification | Tests and release probes use real local Supabase sessions and throwaway non-demo fixture households. A slimmer production gate runs on a fixture household that the probe creates and deletes. |
| Scripted model | Keep as test-only. Production refuses `MODEL=scripted`; the AgentCore bundle stops shipping it. |
| Hackathon material | Archive `docs/submission/` under `docs/archive/hackathon/`; drop the review-access ledger; forget the synthetic Vega and Parker memory in production; disable the unused email/password provider in hosted Supabase. |

Derived decisions (taken in this plan from repository evidence):

| Decision | Choice | Reason |
| --- | --- | --- |
| Schema removal | Two releases: expand (code stops using demo, data converted) then contract (drop demo schema) | The playbook applies migrations before the web deploy (`CLAUDE.md` Deployment section), and AgentCore deploys separately. Dropping `homes.demo` while the old web app or old AgentCore bundle still selects it would break live requests. |
| Retention job | Contract migration redefines `private.apply_data_retention_before_guest_delivery` without demo predicates | Its latest body (`supabase/migrations/20260905000300_guest_notes.sql:10-215`) reads `home.demo` at `:32,78-84,92,140,168,186,194`. Plpgsql is not dependency-tracked, so dropping the column alone would make the nightly job fail at runtime. |
| Production gate transport | The internal agent route (`x-layalga-internal: AGENT_ROUTE_SECRET`) and the tick route, as probe 4 already does | No browser host session is possible in production once email auth is disabled. `agentTaskSchema` accepts `host_capture` and `guest_submit` (`src/agent/task.ts:24-40`). |
| Local seed | `supabase/seed.sql` keeps a small non-demo development household (home, rooms, hosts, host claims) and no parties | Local Google sign-in needs host claims; tests build their own fixtures. |
| Scripted fixture names | Fixture households may name parties to match the scripted model's fixtures (`src/agent/scripted-model-selection.ts:88-99`) | These are test data in test households, not a demo mode. |

## Verified production state (2026-10-15)

From the research artifact and planning-session reads, all read-only: one home (`…0001`, `demo = true`) with 2 hosts (1 bound to an auth user), 3 rooms, 2 parties, 2 invitations, 0 visits, 1 `demo_clock` row; 0 runs, audit events, decisions, notifications, host email pings, calendar feeds, room proposals, private blocks and agent sessions; 0 probe homes; 1 `auth.users` row; 5 review-access events. Hosted Supabase Auth reports Google and email enabled with sign-up open. Vercel production defines `DEMO_MODE` and `DEMO_SESSION_SECRET`.

## Phases

| Phase | Title | Main files | Batch |
| --- | --- | --- | --- |
| 1 | [Real-auth test foundation](2026-10-15-real-use-launch-phases/phase-1.md) | new `src/test-support/fixture-household.ts`, new `tests/e2e/helpers/host-session.ts`, six e2e specs | sequential |
| 2 | [Release probes and CI on fixture households](2026-10-15-real-use-launch-phases/phase-2.md) | `scripts/release-probes.ts`, `scripts/release-helpers.ts`, `scripts/agentcore-smoke.ts`, `.github/workflows/{ci,production-probes}.yml`, deleted `scripts/demo-e2e.ts`, `scripts/benchmark-coordination*` | sequential |
| 3 | [Remove demo mode from the application](2026-10-15-real-use-launch-phases/phase-3.md) | sign-in, auth, demo routes and components, clock, scheduler, notifications, i18n, env, agent bundle, conversion migration, `seed.sql` | sequential |
| 4 | [Documentation and hackathon archive](2026-10-15-real-use-launch-phases/phase-4.md) | `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**` | `[batch-eligible]` with phase 3 (no file overlap) |
| 5 | [Release 1: real-use launch](2026-10-15-real-use-launch-phases/phase-5.md) | production actions only | authorization required |
| 6 | [Contract: drop demo schema, release 2](2026-10-15-real-use-launch-phases/phase-6.md) | new contract migration, `scripts/forget-synthetic-memory.ts` deletion | sequential, after phase 5 |

Phases 1 to 3 must run in order: phase 2 consumes the phase 1 fixture builder, and CI keeps passing at every phase only if tests leave the demo before the demo is removed. Phase 4 touches only documentation and can run in its own worktree beside phase 3, with one integration owner. Phase 5 needs explicit owner authorization for each production action. Phase 6 starts only after phase 5 has deployed the new AgentCore bundle.

## Success criteria

### Automated (every phase, sequentially, failures aggregated)

- `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run build`
- `pnpm run test:integration` and `pnpm run test:e2e` against the local Supabase stack
- `pnpm run release:probes --base http://127.0.0.1:3008` against a local dev server (phase 2 onward)
- `bash scripts/verify-bootstrap.sh`
- Phase 3 onward: `grep -rnE "DEMO_MODE|DEMO_SESSION_SECRET|demo-enter|DbDemoClock|DEMO_SEED|resetDemoHome|review_access" src scripts tests .github playwright.config.ts .env.example` returns nothing (the only allowed hits are listed in phase 3)
- Phase 3 onward: `scripts/build-agent-bundle.sh` fails if the esbuild metafile includes `scripted-model`
- Phase 6: an integration test runs `private.apply_data_retention()` after the contract migration and checks that a non-demo home's old rows are redacted

### Manual or production (phase 5 and 6, each separately authorized)

- The live sign-in page shows the Google button and no demo entry; `/en/demo-enter` returns 404.
- The owner signs in with Google and lands on the host dashboard of home `…0001`, which shows zero rooms and an add-room path.
- The production gate workflow passes on the release commit.
- Hosted Supabase `/auth/v1/settings` reports `email: false`, `google: true`.
- The AgentCore Memory forget run reports the synthetic Vega and Parker records removed.

## Stuck states and recovery

| State | Who sees it, and what | How it ends | Proving test |
| --- | --- | --- | --- |
| A Google account without a host claim signs in | That person: sign-in page with the existing `notHostError` text (`src/app/auth/callback/route.ts:45-55`) | They are signed out by the callback; a host adds a claim row (documented in the host manual, phase 4) | Existing callback tests; phase 3 adds a sign-in page test that the error renders with the Google button |
| Google OAuth fails (consent screen in testing, redirect mismatch) | The person signing in: `callbackError` text on the sign-in page (`route.ts:59`) | Phase 5 step 2 verifies the Google client before the env change; step 10 proves a real sign-in after release | Existing `src/app/auth/callback/route.test.ts` covers the `oauth_failed` redirect; phase 3 sign-in page test covers the rendered error |
| A browser still holds an old `layalga_demo_host` or `layalga_demo_guest` cookie | Nobody: the cookie is ignored after phase 3 and expires within 12 hours (`src/lib/auth/demo-session.ts:3-6`) | Automatic | Phase 3 unit test: `getCurrentHost` with only a demo cookie returns null |
| Window between removing `DEMO_MODE` from Vercel and deploying release 1 | Visitors: the old code shows the Google button and no demo entry | Ends on deploy | Phase 5 verification step reads the live page |
| Contract migration applied while an old AgentCore bundle still selects `homes.demo` | Hosts and guests: agent runs fail and the run status page shows the failed state | Phase 6 entry gate requires the AgentCore runtime version from release 1; recovery is redeploying the current bundle | Phase 6 preflight script compares the deployed runtime version with the release 1 record and refuses to continue |
| Contract migration run before the conversion | The migration fails closed | The migration raises `demo homes still exist; apply the conversion first` | Phase 6 migration test on a database with a demo home |
| Production gate fails mid-run and leaves a fixture household | Nobody sees it in the UI (no host is bound to it) | `finally` cleanup deletes it; `pnpm run release:probes -- --cleanup-only <runId>` deletes it manually, and the failure output prints that command | Phase 2 test: cleanup runs after an injected probe failure and the printed command is present |
| Local e2e host sign-in when email auth is disabled locally | Developer: the helper throws a message that names `supabase/config.toml [auth.email]` | Developer re-enables it; the message says where | Phase 1 helper unit test |
| `MODEL=scripted` in a production environment | Operator: startup error `MODEL=scripted is test-only; set MODEL=bedrock` | Operator sets `MODEL=bedrock` | Phase 3 env unit test |

## Consumer sweep

Commands used in planning (from the repository root), with every hit assigned to a phase in the phase files:

```
grep -rnE "DbDemoClock|DemoClockStore|demo_clock|demoNow" src scripts tests
grep -rnE "schedulerForHome" src scripts tests
grep -rnE '\.demo\b|homeDemo|\bdemo\??:|select +demo\b|"demo"' src scripts --include='*.ts' --include='*.tsx'
grep -rn "DEMO_MODE" src scripts next.config.ts vercel.json .github playwright.config.ts
grep -rnE "GuestDeliveryStatus|GuestContactState|loadGuestDeliveryFacts" src scripts
grep -rnE "DEMO_SEED|resetDemoHome|@/lib/demo|@/core/demo|advanceDemoClock" src scripts tests package.json
grep -rnE "demo-session|demo-mutation|review-access|DEMO_HOST_COOKIE|DEMO_GUEST_COOKIE|startReviewSession|createDemo(Host|Guest)Cookie|authorizeDemoMutation" src scripts tests
grep -rnE "DemoClockPanel|DemoSeasonSync|DemoZone|GuidedDemoPanel|GuidedDemoStart|DemoGuestGuide" src scripts tests
grep -niE "demo|synthetic|guided" messages/en.json messages/es.json
grep -rnE "scripted-model-selection|scripted-outcomes|scriptedModelForTask" src scripts tests
grep -rnE "home\.demo|homes\.demo|demo_clock|demo_mutation|review_access|restore_demo_identity_claims" supabase
```

| Consumer group | Covered by |
| --- | --- |
| Clock: `src/core/clock.ts:36-97`; runtime callers `src/agent/runtime/deps.ts:24`, `src/core/booking/guest-actions.ts:90,249`, `src/components/host/host-outcomes.tsx:26`, `src/components/host/guest-delivery-panel.tsx:20`, `src/components/guest/load-guest-invitation-defaults.ts:17`; raw SQL `src/core/booking/guest-invitation.ts:116-136`, `src/app/[locale]/(host)/host-context.ts:13-41` and its pages | Phase 3 |
| Clock tests: `src/core/clock.test.ts`, `guest-clock.integration.test.ts`, `host-outcomes.integration.test.ts`, `g/[token]/actions.test.ts`, `deps.test.ts`, `load-guest-invitation-defaults.test.ts`, `queue.test.ts:165`, `advance-clock.integration.test.ts` | Phase 3 |
| Scheduler: `src/agent/scheduler/index.ts:122-130` and callers `deps.ts:25`, `guest-actions.ts:253,306`, `visits/actions.ts:31-58`, `(host)/actions.ts:264-276`, plus their tests | Phase 3 |
| Tick filters: `src/core/booking/holds.ts:394-400`, `src/core/reconfirmation/jobs.ts:634-640`, `jobs.test.ts:190-202` | Phase 3 |
| Guest delivery status `demo`: `guest-outbox.ts:40,61,79,322`, `guest-contact.ts:16,40,143,165,184-188,215,245,283`, `guest-delivery-panel.tsx:28-67`, `guest-email-preferences.tsx:77-83`, `guest/email-actions.ts:61`, and tests | Phase 3 |
| Auth: `demo-session.ts`, `demo-mutation.ts`, `current-host.ts:19-103`, `current-guest.ts:37-57`, `guest-email-session.ts:7,21`, `sign-out/route.ts:3,29-41`, both demo-enter routes, sign-in page, and their tests | Phase 3 |
| Review ledger: `src/lib/review-access.ts`, `scripts/review-access.ts`, `scripts/review-access.test.ts`, `package.json:32` | Phase 3 (code); phase 6 (table) |
| Demo API, components, CSS, i18n: `src/app/api/demo/**`, seven demo components, `guest-ledger.module.css:336-356`, inline bands in `guest-shell.tsx` and `(host)/layout.tsx`, `frontend-utils.ts:138-141`, 47 keys per locale, `frontend-remediation.test.tsx:34-42,130-132`, `frontend-boundaries.test.tsx:27,88-90` | Phase 3 |
| Seed and reset: `src/lib/demo/reset.ts`, `src/core/demo/*`, `scripts/seed-demo.ts`, `supabase/seed.sql`, `package.json:18,25` | Phase 3 |
| `scripts/seed-memory.ts` and test | Phase 3 converts to `scripts/forget-synthetic-memory.ts`; phase 6 deletes it after the production forget |
| E2E specs: `host-view`, `mobile-guest-host`, `mobile-tap-targets`, `webmcp-registration`, `run-status-styling`, `guest-link` | Phase 1 |
| E2E specs `guest-demo-session`, `guided-demo`; `tests/e2e/global-setup.ts`; Playwright `DEMO_*` env | Phase 3 (deleted with the features they test) |
| Release scripts: `scripts/release-probes.ts`, `release-helpers.ts`, `demo-e2e.ts`, `agentcore-smoke.ts`, `benchmark-coordination*`, and their tests; `.github/workflows/ci.yml:72-142`, `production-probes.yml` | Phase 2 |
| Scripted model: `src/lib/server/env.ts:6,90-95,247-253`, `src/agent/runtime/deps.ts:8,30-31`, `scripts/build-agent-bundle.sh:23-42` | Phase 3 |
| SQL: `homes.demo`, `demo_clock`, `demo_mutation_*`, `review_access_events`, `restore_demo_identity_claims`, `apply_data_retention_before_guest_delivery` | Phase 3 (data conversion); phase 6 (schema) |
| `src/core/db/schema.ts:89,569-575` | Phase 3 |
| Excluded: `src/agent/scripted-outcomes.ts` and `Runs.outcomes` keys | Kept: the scripted model still produces them in tests (`run-status-poller.tsx:237`) |
| Excluded: one-shot DO blocks in old migrations (`20260831083526…:13-24`, `20260831001600…:61-71`, `20260831001700…:1-16,292-303`) | Already applied; migrations are immutable history |
| Excluded: `src/agent/party-match.ts:14-15` "Familia Vega" example | Generic example text, not demo behaviour |

## Risks

| Risk | Mitigation |
| --- | --- |
| The conversion deletes data a real person entered | The research found 0 visits and only seeded parties; the migration acts only while `demo = true`, and a phase 5 read-only preflight repeats the counts immediately before `db push`. If any visit exists, stop and ask. |
| Production loses the interrupt/resume, reconfirmation and room-coordination probes | They stay in the local CI probe suite and in integration tests; the production gate covers identity, AgentCore capture, guest confirmation, concurrency, isolation and cleanup (impact section in phase 2). |
| `pnpm run build` with `NODE_ENV=production` and `MODEL=scripted` in CI trips the new production refusal | Phase 3 verifies that the refusal runs only where the environment is parsed at request time, and runs `pnpm run build` with the CI environment. |
| Hosted Supabase still allows email sign-up after the change | Phase 5 verifies `/auth/v1/settings` after the change. |
| Google client in "Testing" status admits only listed test users | Phase 5 checks the publishing status before removing `DEMO_MODE`. |

## Out of scope

- Self-service household creation or host onboarding beyond the existing claim allow-list.
- Activating consented guest SES delivery (separately authorized rollout work, `CLAUDE.md` Current product).
- Renaming the household or changing its timezone.
- WhatsApp or Twilio integration.

## Handoff

- Objective: remove demo mode and restore Google sign-in for real use. Planning complete when the owner accepts this plan.
- Authorized so far: research and planning. Implementation, every production action in phase 5, and the phase 6 release each need explicit authorization.
- Base: `develop` at `fea093b`, worktree `/Users/juan/code/layalga`. Implementation runs in a worktree off `develop`; revalidate the base before phase 1.
- Evidence limits: production `DEMO_MODE` value inferred from the live page; Google Cloud client status not checked; AgentCore Memory contents not checked.
- Next: `rpi-implement` phase 1.
