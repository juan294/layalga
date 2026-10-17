# Phase 1: account identity in the header

Parent: [plan](../2026-10-17-host-sign-in-identity.md)

Shows the signed-in Google account (email and avatar) in the shared header and lets the layout and `getCurrentHost` share one Supabase Auth lookup per request.

## Entry conditions

- On a temporary branch cut from `develop` at `66b3980` or later; clean tree. Never commit on `develop`.
- Local Supabase stack running from this checkout (`docker ps` labels show project `layalga` and this workdir). Do not stop or reset it.

## Files

| File                                    | Action                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `src/lib/auth/account-identity.ts`      | new: pure `toAccountIdentity(user)`                                          |
| `src/lib/auth/account-identity.test.ts` | new                                                                          |
| `src/lib/auth/current-user.ts`          | new: `getAuthUser` (React `cache`) and `getCurrentAccount`                   |
| `src/lib/auth/current-host.ts`          | edit: `getCurrentHost` reads `getAuthUser` (`:28-37`)                        |
| `src/components/account-chip.tsx`       | new: presentational chip                                                     |
| `src/components/account-chip.test.tsx`  | new: `renderToStaticMarkup`                                                  |
| `src/app/[locale]/layout.tsx`           | edit: load the account, render the chip (`:79-116`)                          |
| `src/app/globals.css`                   | edit: `.site-header__account*` rules beside `.site-header__signout` (`:166`) |
| `src/proxy.ts`, `src/proxy.test.ts`     | edit: `img-src` (`:23`), assertions (`:41`)                                  |
| `messages/en.json`, `messages/es.json`  | edit: `Brand.signedInAs` (`:7-11`)                                           |
| `tests/e2e/helpers/household.ts`        | edit: `signIn` returns `{ email }` (`:20,49-50`)                             |
| `tests/e2e/host-view.spec.ts`           | edit: chip assertions                                                        |
| `tests/e2e/mobile-tap-targets.spec.ts`  | edit: 390px header assertions                                                |

## Step 1: pure identity model (red first)

```
@ toAccountIdentity(user) -> AccountIdentity | null
ctx: Supabase `User` from auth.getUser(), no IO
pre: caller passes a server-verified user, never submitted metadata
do:
  1. return null unless user.email and user.email_confirmed_at
  2. find the identity with provider "google"; read identity_data.picture
  3. validate avatar: URL parses, protocol https, hostname ends .googleusercontent.com
  4. compute initial: first letter of email, uppercased
  5. return { email, avatarUrl or null, initial }
br: no google identity -> avatarUrl null; invalid URL -> avatarUrl null
fail: none; every failure degrades to null avatar or null identity
risk: user_metadata must never feed avatarUrl (user-writable)
```

Tests first (`account-identity.test.ts`): confirmed Google user returns email and avatar; unconfirmed email returns null; `http://`, `javascript:`, `https://evil.example/x.png`, `https://googleusercontent.com.evil.example/x`, a non-string `picture` and a `user_metadata.avatar_url` alone all give `avatarUrl: null`; a host with no Google identity gives monogram only.

## Step 2: one Auth lookup per request

```
@ getAuthUser() -> User | null
ctx: Supabase server client, React cache()
pre: called only from server components and helpers that render pages
do:
  1. create the server client
  2. call auth.getUser() once per request
  3. return the user or null
fx: one network call to Supabase Auth per request (was two on host pages)
risk: route handlers and server actions must keep their own fresh getUser()
```

`getCurrentHost` keeps its signature and calls `getAuthUser`. `getCurrentAccount()` returns `toAccountIdentity(await getAuthUser())`. The sweep rows for `auth.getUser()` call sites explain why the other sites stay unchanged.

## Step 3: chip and layout

```
@ AccountChip({ identity, label }) -> JSX | null
ctx: server-rendered, no state
pre: identity from toAccountIdentity
do:
  1. return null when identity is null
  2. render a span with data-testid "account-chip" and title = identity.email
  3. render monogram span, then img (referrerPolicy no-referrer, alt "") on top when avatarUrl
  4. render the email text, truncated with an ellipsis
  5. prefix a visually hidden label "Signed in as" (Brand.signedInAs)
risk: img must not reserve space when it fails; monogram sits underneath
```

Layout: add `getCurrentAccount()` to the existing `Promise.all`, render `<AccountChip>` inside `.site-header__controls` before the Sign out form, and leave `signedIn` and the Sign out form unchanged. The chip shows whenever an identity exists, which includes a Google guest on `/visits`, whose page keeps its own Sign out form (`visits/page.tsx:113`).

Messages: `Brand.signedInAs` = "Signed in as" (es "Sesión iniciada como"). CSS: 2rem circular avatar and monogram, `max-inline-size` for the email (about 16rem desktop, 40vw under 720px), `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, token colors only, no fixed pixel widths that overflow at 390px.

CSP: `img-src 'self' data: blob: https://*.googleusercontent.com`.

## Step 4: tests and rendering evidence

- `account-chip.test.tsx`: renders email, monogram, `referrerpolicy="no-referrer"` and the hidden label; renders nothing for null; both locales' label text.
- `proxy.test.ts`: the policy contains the exact `img-src` value and still excludes wildcard `https:`.
- e2e (`host-view.spec.ts`): after `household.signIn(context)` the header chip shows the returned fixture email and the monogram; with a route that fulfills a Google avatar URL the image loads under the CSP; with the route aborted the monogram stays visible.
- e2e (`mobile-tap-targets.spec.ts`): at 390px the document has no horizontal scroll and the chip sits inside the header, also for a 60-character email.
- Rendering evidence: Playwright screenshots of the host header at 1280px and 390px, light and dark, long email, no avatar, stubbed avatar. Read each image before accepting.

## Acceptance

Automated: `pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run test:e2e && pnpm run build`, run sequentially with every exit recorded. New tests fail against the old code first.

Manual: none in this phase (the real Google account check is phase 3).

## Exit

Committed on the temporary branch; plan notes updated with deviations. Stop at the phase boundary unless the owner continues.
