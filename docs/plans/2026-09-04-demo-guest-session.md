# Plan: Demo guest session + sign-in page cleanup

Date: 2026-09-04
Status: implemented

## Goal

Replace the sign-in page's two "Enter as {host}" buttons with one "Enter as Host"
and one "Enter as Guest" button, backed by a real signed demo-guest session
(mirroring the existing `layalga_demo_host` cookie). Hide "Continue with Google"
for the duration of the hackathon by gating it on the existing `DEMO_MODE` flag.

## Context

- Hackathon-only, demo-scoped change. Production currently runs with
  `DEMO_MODE=true` (see `docs/research/2026-09-03-hackathon-readiness-and-strands-leverage.md:52`),
  so reusing that flag to hide the Google button takes effect immediately with
  no new env var and no CI/`.env.example` changes.
- Decided with the user (2026-09-04 conversation):
  1. Guest entry is a **real signed cookie session**, not a redirect to the
     seeded magic link.
  2. Keep **Juan González** as the sole "Enter as Host" persona (existing e2e
     specs already hardcode his host id `...0201` for cookie injection — see
     `tests/e2e/host-view.spec.ts:10-27`, `mobile-guest-host.spec.ts:20-27`,
     `mobile-tap-targets.spec.ts:104-111`, `webmcp-registration.spec.ts:25-32`).
     Drop **Jordan Lynn**'s host button; his invitation (**The Oteros** — dog +
     wheelchair-access request, room "Garage conversion") becomes the guest
     demo scenario.
  3. Guest button label is the static string "Enter as Guest" (new
     `DemoHost.enterAsGuest` i18n key), not a party-name-parameterized label.
  4. Google button hide is scoped to the main sign-in page only. The Google
     buttons on the guest-claim aside (`g/[token]/page.tsx:119-124`) and the
     `/visits` account page (`visits/page.tsx:39-44`) are unchanged.

## Why this is bigger than a button relabel

Unlike hosts, guests currently have **no cookie-based session at all**. Every
guest interaction — the `/[locale]/g/[token]` page, all 4 server actions in
`g/[token]/actions.ts`, and the post-submit run-status redirect — is
authorized purely by a raw link token in the URL, re-validated on every
request via `findInvitationByToken` (`src/core/booking/invitations.ts:194`).
There is no `getCurrentGuestInvitation()` analogous to `getCurrentHost()`.

Building a real guest identity therefore requires:
1. A new signed cookie + resolver (mirrors `demo-session.ts` / `current-host.ts`).
2. A resolution seam so the *same* guest business logic can be reached either
   by token (existing magic link) or by cookie (new demo session), without
   forking the guest UI.
3. A new, token-free route that reuses the existing guest components.
4. A third authorization branch in `getAuthorizedRunSnapshot` so a
   cookie-authenticated guest's submitted run can be polled without a token
   in the query string.

## Architecture summary

**New files**
- `src/lib/auth/current-guest.ts` — `getCurrentGuestInvitation()`, DEMO_MODE-gated,
  mirrors `current-host.ts`'s demo branch.
- `src/core/booking/guest-invitation.ts` — relocated from
  `src/app/[locale]/g/[token]/guest-data.ts`; `resolveGuestInvitationAuthority`
  and `loadGuestInvitation` take an `identity: {token} | {invitationId}` union
  instead of a bare token, so both the token route and the new cookie route
  call the same functions.
- `src/core/booking/guest-actions.ts` — the four guest actions' core logic
  (find options / submit visit / request change / reconfirm), extracted from
  `g/[token]/actions.ts`, parameterized by an already-resolved authority
  instead of re-deriving it from a token.
- `src/app/[locale]/guest/page.tsx` + `src/app/[locale]/guest/actions.ts` —
  the cookie-authenticated guest route, reusing `GuestInviteForm` /
  `GuestVisitRecord` / `GuestActions` with the extracted core logic.
- `src/app/[locale]/demo-enter-guest/route.ts` — POST route mirroring
  `(host)/demo-enter/route.ts`, sets the new guest cookie.

**Changed files**
- `src/lib/auth/demo-session.ts` — add `DEMO_GUEST_COOKIE`,
  `createDemoGuestCookie`, `readDemoGuestCookie`, `readDemoGuestSession`.
- `src/core/booking/invitations.ts` — add `findInvitationById`.
- `src/app/[locale]/g/[token]/actions.ts` — thin wrappers over the extracted
  core, using `{token}` identity, unchanged external behavior.
- `src/components/guest/guest-invite-form.tsx`,
  `src/components/guest/guest-actions.tsx` — `token` becomes optional; the two
  server actions become props instead of hardcoded imports, so the new guest
  route can inject its own cookie-based actions.
- `src/app/api/runs/run-data.ts` — `getAuthorizedRunSnapshot` gains a third
  fallback branch: token → host cookie → **guest cookie**.
- `src/app/[locale]/sign-in/page.tsx` — one host query (`limit 1`), one guest
  invitation query (the demo invitation whose host is *not* the shown host),
  Google button gated on `DEMO_MODE`.
- `messages/en.json`, `messages/es.json` — add `DemoHost.enterAsGuest`.

**Unaffected by design (confirmed, no changes needed)**
- `src/app/[locale]/runs/[id]/status/page.tsx` and
  `src/components/runs/run-status-poller.tsx` — already tolerate a missing
  `token` query param and fall through to cookie-based authorization; the new
  guest cookie branch in `run-data.ts` is picked up automatically.
- `src/app/api/runs/[id]/route.ts` — same reason.

## Phases

- [x] **Demo-guest session primitives** `[batch-eligible]` — cookie mint/verify +
   `getCurrentGuestInvitation()`.
- [x] **Guest core extraction** `[batch-eligible]` — relocate guest data/actions
   into `core/booking/`, generalize to accept token-or-invitationId identity,
   make shared UI components accept injected actions and optional token.
   No file overlap with phase 1.
- [x] **Cookie-authorized guest route** — new `/[locale]/guest` route,
   `demo-enter-guest` route, `run-data.ts` fallback branch. Depends on 1 and 2.
- [x] **Sign-in page rewrite** — single host + single guest button, i18n key,
   Google-button gating, clean `data-testid`s. Depends on 3.
- [x] **End-to-end verification** — e2e coverage for both demo buttons, grep
   `scripts/demo-e2e.ts` for any Jordan-host-id dependency, full verification
   suite. Depends on 4.

Phases 1 and 2 have zero file overlap and no dependency on each other — run
them with `/batch`. Phases 3-5 are sequential.

## Out of scope

- Real production OAuth wiring (untouched, only its render condition changes).
- The guest-claim Google button (`g/[token]/page.tsx`) and the `/visits`
  account page's Google button — both stay visible regardless of `DEMO_MODE`.
- Any change to `scripts/seed-demo.ts` / `src/lib/demo/reset.ts` seed data —
  Jordan Lynn stays a `hosts` row (required by the `invitations.host_id`
  foreign key on The Oteros' invitation); only the sign-in page stops
  rendering a button for him.
- Consolidating the host/guest cookie signing helpers into one generic
  function — two occurrences don't yet justify the abstraction per project
  convention; revisit in `/simplify` if a third demo-session type appears.

## Testing strategy

Per `.claude/rules/testing.md`: red-green-refactor, refactors need existing
coverage first. `g/[token]/actions.test.ts` currently covers
`findGuestOptions`/`submitGuestVisit` but **not** `requestGuestChange` or
`reconfirmGuest` — phase 2 adds characterization tests for those two before
extracting their core logic.

Run sequentially after each phase: `pnpm run typecheck ; pnpm run lint ; pnpm run test`.
Phase 5 additionally runs `pnpm run test:e2e` and `pnpm run demo:e2e` (require
local Supabase stack + demo seed per CLAUDE.md).

## Manual verification (cannot be automated)

- Visually confirm the sign-in page renders exactly two buttons and no Google
  button when `DEMO_MODE=true`, in both `en` and `es` locales.
- Click through "Enter as Guest" in a browser: land on `/en/guest`, see The
  Oteros' invited state, search for a stay, submit, watch the run-status page
  resolve without a `token` in the URL, and confirm reconfirm/request-change
  still work from the cookie session.
