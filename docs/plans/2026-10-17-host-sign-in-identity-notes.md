# Host sign-in identity: implementation notes

Plan: [2026-10-17-host-sign-in-identity.md](2026-10-17-host-sign-in-identity.md)

## Handoff

- Objective: show the signed-in Google account, always offer the Google account picker, and rename the host dashboard (phases 1 and 2 are complete locally). Phase 3 (release v2.3.0) needs separate owner authorization and is not started.
- Authorized scope: the owner asked for all phases without stopping and a local merge into `develop` (2026-10-17). The request does not authorize a push, deployment, tag, release or provider action.
- Base: `develop` at `66b3980`. Work branch: `feat/host-sign-in-identity` in the worktree `.claude/worktrees/host-sign-in-identity`.
- Local database: tests used the existing stack of this checkout (`supabase_*_layalga`, project `layalga`). No `supabase stop`, `db reset` or volume command ran.

## Phase 1: account identity in the header

### TDD evidence

- RED (before the code existed): `pnpm exec vitest run src/lib/auth/account-identity.test.ts src/components/account-chip.test.tsx src/proxy.test.ts` gave 3 failed files (two import errors for the missing modules, one `img-src` assertion failure: received `img-src 'self' data: blob:`).
- GREEN: the same files pass after the implementation (27 tests at first, 30 after review repairs).
- The e2e specs were written after the implementation, not before. Mutation checks stand in for a red run: removing the CSP host made the avatar test fail (`naturalWidth` 0), and removing `referrerPolicy` made the no-referrer assertion fail.

### Rendering evidence

Playwright screenshots of the header at 1280px and 390px, light and dark, for the monogram, a 60-character email and a stubbed SVG avatar (12 images) were read before acceptance. They are kept in the primary checkout under `docs/agents/2026-10-17-host-sign-in-identity-evidence/` (gitignored). The first phone capture showed the page scrolling sideways with the chip on the controls row. The repair is recorded under D2.

### Gate evidence (candidate: the working tree committed as the phase 1 commit; no source change after the run)

Sequential run in the worktree against this checkout's local stack:

| Check                | Result                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck` | exit 0                                                                                                                                                                                                                      |
| `pnpm run lint`      | exit 0                                                                                                                                                                                                                      |
| `pnpm run test`      | First run exit 1: 8 tests in 5 files failed with `DATABASE_URL is required` (the shell had no database URL). Rerun with the local-only values from `.env.development.local` (127.0.0.1:54622): exit 0, 158 files, 807 tests |
| `pnpm run test:e2e`  | exit 0, 30 passed (chromium and mobile-webkit), including the three header specs and the 60-character email spec                                                                                                            |
| `pnpm run build`     | First run exit 1: stale generated types in `.next/dev` (left by the e2e dev server) failed `tsc` on the unchanged privacy page. After `rm -rf .next/dev`: exit 0                                                            |

The two first-run failures came from the environment, not from the change: a missing variable, and generated files that the e2e dev server leaves in the worktree. Run `pnpm run build` after removing `.next/dev` when it follows `test:e2e` in the same checkout.

### Review findings (independent reviewer, fresh context)

| ID   | Finding                                                           | Disposition                                                                                                                     |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| R1-1 | The no-referrer assertion might not be able to fail               | Resolved: uses `allHeaders()`, asserts the avatar was requested, and fails when `referrerPolicy` is removed (mutation verified) |
| R1-2 | The blocked-avatar test did not detect painting over the monogram | Resolved: compares the avatar element's pixels with the failed image present and removed                                        |
| R1-3 | Monogram, `aria-hidden` and identity-order test gaps              | Resolved: non-BMP and `ß` initials, `aria-hidden` count, Google identity not first                                              |
| R1-4 | Locale label test compared JSON to a literal                      | Resolved: asserts en and es labels differ and that each renders                                                                 |
| R1-5 | `ß` gives a two-letter monogram                                   | Resolved: uppercases first, then takes the first code point                                                                     |
| R1-6 | Label is absolute inside a non-positioned parent                  | Resolved: `.site-header__account` is `position: relative`                                                                       |
| R1-7 | Deviations not recorded                                           | Resolved: D1 and D2 below                                                                                                       |

### Simplify pass (four reviewers: reuse, simplification, efficiency, altitude)

| Finding                                                                  | Disposition                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| CSP host and validator suffix repeat the Google avatar domain            | Applied: `GOOGLE_AVATAR_DOMAIN` is exported once; a test ties the validator's accepted host to the CSP |
| Phone chip rules sit in a second 720px block                             | Applied: merged into the existing block beside `.site-header__controls`                                |
| `visits/page.tsx` and `g/[token]/page.tsx` make a second Auth round trip | Applied (D3)                                                                                           |
| Try/catch around `new URL`                                               | Applied: `URL.canParse`                                                                                |
| Test duplication (initials, label regex, `aria-hidden` regex)            | Applied: `it.each` for initials, simpler assertions                                                    |
| E2E avatar tests load `/en` twice (the `beforeEach` plus the test)       | Skipped: about one second per test; a separate describe would split the file for little gain           |
| Shared `verifiedEmail` helper with `verified-guest-email.ts`             | Skipped: the two rules differ on purpose (the guest helper requires a Google identity)                 |
| Nested rect object in the mobile e2e test; module-level `hostAccount`    | Skipped: no behavior change; the pattern follows the existing specs                                    |

## Phase 2: account picker and host naming

### TDD evidence

- RED: `pnpm exec vitest run "src/app/[locale]/sign-in/sign-in-button.test.tsx"` against the old button gave 2 failed and 1 passed. The failing cases saw `signInWithOAuth` called without `queryParams` (exact-object assertion) and no `queryParams` to inspect. The passing case (no call when `/auth/prepare` fails) pins existing behavior.
- GREEN: after adding `queryParams: { prompt: "select_account" }` the file passes (3 tests).
- The missing-code callback case (`route-guest.test.ts`) and the locale parity tests pin behavior that already held; they pass against the old code by design. The parity file would have caught a one-sided message edit.

### Gate evidence (candidate: the phase 2 commit; no source change after the run)

Sequential run in the worktree against this checkout's local stack, with the local-only values from `.env.development.local` and `.next/dev` removed before the build:

| Check                | Result                                         |
| -------------------- | ---------------------------------------------- |
| `pnpm run typecheck` | exit 0                                         |
| `pnpm run lint`      | exit 0                                         |
| `pnpm run test`      | exit 0, 160 files, 814 tests                   |
| `pnpm run test:e2e`  | exit 0, 31 passed (chromium and mobile-webkit) |
| `pnpm run build`     | exit 0                                         |

### Review findings (independent reviewer, fresh context; verdict APPROVED)

| ID   | Finding                                                                          | Disposition                                                                               |
| ---- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| R2-1 | Consent test redundant and weaker than the exact-equality assertion              | Resolved: asserts that the `prompt` value has no `consent` token                          |
| R2-2 | Mocked `useState` and direct component call are brittle if the fragment reorders | Accepted: follows `capture-invitation-form.test.tsx`; the plan allowed it                 |
| R2-3 | Prepare-failure case did not assert the error state                              | Resolved: the first `useState` setter is asserted to receive `true`                       |
| R2-4 | Parity test pinned literal copy strings                                          | Resolved: keeps breadcrumb equals title and eyebrow differs from title, in both languages |
| R2-5 | Missing-code case sits in `route-guest.test.ts`, not `route.test.ts`             | Accepted: that file already holds the callback behavior tests with the mocked Auth client |

Cleanup angles (reuse, complexity, efficiency, altitude) found nothing further in the phase 2 diff.

## Phase 3: release v2.3.0

Not started. The entry conditions need the owner's release authorization, and every production action (push, release pull request, AgentCore deploy, probe dispatch, memory sweep, tag) needs fresh authorization. The request that started this work authorized a local merge only.

## Deviations

### D1: `household.signIn` returns `{ userId, email }`

- Plan said: widen `Promise<void>` to `Promise<{ email: string }>`.
- Found: `signInAsHost` already returns `{ userId, email }`, and the Google-identity e2e tests need the user ID.
- Chose: return both fields. Why: a superset stays compatible with the five existing callers, which ignore the value.

### D2: phone layout gives the chip its own row

- Plan said: `max-inline-size` 16rem on desktop, 40vw under 720px.
- Found: at 40vw the chip pushed Sign out onto a second row and clipped the email to about ten characters. A full-width chip first overflowed the page because `.site-header__controls` had no `min-inline-size: 0`.
- Chose: the chip takes a full row above the controls under 720px (`flex: 1 0 100%; order: -1`), and `.site-header__controls` gets `min-inline-size: 0`. Why: the email stays readable, Sign out stays on the controls row, and the 60-character email test shows no horizontal scroll.

### D3: two guest pages use the cached Auth lookup

- Plan said: only `current-host.ts` moves to `getAuthUser`; the other `auth.getUser()` sites stay, with the reason "they need their own fresh call (actions, route handlers)".
- Found: `visits/page.tsx` and `g/[token]/page.tsx` are server components that render under the layout, so the reason does not cover them, and they paid a second Auth round trip per request.
- Chose: both pages call `getAuthUser()`. Route handlers, server actions and `guest-contact-authority.ts` keep their own lookups. Why: it makes the plan's goal (one Auth lookup per request) true on guest pages; the existing page tests pass unchanged.

### D4: e2e specs are written after the code

- Plan said: new tests fail first against the old code.
- Found: the unit tests failed first (see TDD evidence). The Playwright specs were written after the implementation, because they need the running chip to drive.
- Chose: mutation checks on the CSP host and the referrer attribute. Why: they show each e2e assertion can fail.
