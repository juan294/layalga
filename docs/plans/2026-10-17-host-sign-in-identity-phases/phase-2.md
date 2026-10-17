# Phase 2: account picker and host naming

Parent: [plan](../2026-10-17-host-sign-in-identity.md)

Makes Google show its account picker on every sign-in and stops the host dashboard from reading as the guest view.

## Entry conditions

- Phase 1 committed on the same temporary branch (it also edits both message files).
- Clean tree and the same local stack as phase 1.

## Files

| File                                               | Action                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/app/[locale]/sign-in/sign-in-button.tsx`      | edit: add `queryParams` (`:36-41`)                                            |
| `src/app/[locale]/sign-in/sign-in-button.test.tsx` | new                                                                           |
| `messages/en.json`                                 | edit: `Host.eyebrow`, `Host.title`, `Host.nav.backToToday` (`:63-64`, `:276`) |
| `messages/es.json`                                 | edit: the same three keys (`:63-64`, `:276`)                                  |
| `tests/e2e/host-view.spec.ts`                      | edit: `"Guest stays"` at `:86`, `:182`; `"← Guest stays"` at `:104`           |

## Step 1: account picker (red first)

```
@ signIn() -> void
ctx: /auth/prepare, Supabase browser client, Google OAuth
pre: unchanged flow; the shared button serves host, guest and claim paths
do:
  1. post /auth/prepare (unchanged)
  2. create the browser client (unchanged)
  3. call signInWithOAuth with provider google
  4. pass options.redirectTo (unchanged) and options.queryParams { prompt: "select_account" }
  5. surface the error state on failure (unchanged)
fx: Google always shows the account chooser
risk: queryParams must reach the provider URL; assert it in the test
```

Test first (`sign-in-button.test.tsx`, node environment, mocked `@/lib/supabase/client` and `fetch`): clicking the button calls `signInWithOAuth` once with `provider: "google"`, the callback `redirectTo` and `queryParams: { prompt: "select_account" }`; it does not pass `consent`. Because the click handler is a closure, export `signIn` as a small named function or drive it through the mocked `useState`, following `capture-invitation-form.test.tsx`.

Recovery check: confirm `src/app/auth/callback/route.test.ts` has a case for a request without `code` that redirects to `sign-in?error=oauth_failed`; add it if absent. That is the path a user who dismisses the picker takes.

## Step 2: host naming

| Key                    | en before              | en after           | es before                  | es after            |
| ---------------------- | ---------------------- | ------------------ | -------------------------- | ------------------- |
| `Host.eyebrow`         | Household guest ledger | Host dashboard     | Libro de visitas del hogar | Panel del anfitrión |
| `Host.title`           | Guest stays            | Household ledger   | Estancias de invitados     | Libro del hogar     |
| `Host.nav.backToToday` | ← Guest stays          | ← Household ledger | ← Estancias de invitados   | ← Libro del hogar   |

Update the three e2e literals. No component changes: `(host)/page.tsx` reads the keys, and the five sub-pages read `nav.backToToday`.

## Step 3: tests

- `sign-in-button.test.tsx` as above.
- `host-view.spec.ts`: the level-1 heading is "Household ledger" and the breadcrumb is "← Household ledger".
- Run the Spanish locale once in e2e or a message test: `/es` heading is "Libro del hogar".
- Message parity: `pnpm run test` already compares locale key sets if a test exists; if none does, add a three-line assertion that `en.json` and `es.json` define the same `Host` keys.

## Acceptance

Automated: `pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run test:e2e && pnpm run build`, sequential. The new button test fails against the old code first.

Manual: none in this phase.

## Exit

Committed on the temporary branch. Integrate locally into `develop` (squash) only with the owner's go; plan notes updated. Stop at the boundary.
