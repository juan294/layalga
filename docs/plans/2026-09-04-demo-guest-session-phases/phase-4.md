# Phase 4 — Sign-in page rewrite

Depends on phase 3 (`demo-enter-guest` route must exist for the guest form's
`action` target to work).

## Files

- `src/app/[locale]/sign-in/page.tsx` (edit)
- `messages/en.json` (edit)
- `messages/es.json` (edit)

## Step 1 — i18n key

Add to both locale files, in the `DemoHost` namespace (`messages/en.json:43-45`,
`messages/es.json:43-45`), alongside the existing `enterAs`:

```json
"DemoHost": {
  "enterAs": "Enter as {name}",
  "enterAsGuest": "Enter as Guest"
}
```

Spanish:

```json
"DemoHost": {
  "enterAs": "Entrar como {name}",
  "enterAsGuest": "Entrar como invitado"
}
```

## Step 2 — Rewrite the page's demo-data query and rendering

Replace the single `demoHosts` query (`sign-in/page.tsx:31-40`) with two
queries, gated the same way on `DEMO_MODE`:

```ts
const demoMode = process.env.DEMO_MODE === "true";

const demoHost = demoMode
  ? (
      await getDatabaseConnection().sql<{ id: string; display_name: string }[]>`
        select host.id, host.display_name
        from public.hosts as host
        join public.homes as home on home.id = host.home_id
        where home.demo = true
        order by host.created_at, host.id
        limit 1
      `
    )[0]
  : undefined;

const demoGuestInvitation = demoMode && demoHost
  ? (
      await getDatabaseConnection().sql<{ invitation_id: string; family_name: string }[]>`
        select invitation.id as invitation_id, party.family_name
        from public.invitations as invitation
        join public.parties as party on party.id = invitation.party_id
        join public.homes as home on home.id = invitation.home_id
        where home.demo = true and invitation.host_id <> ${demoHost.id}
        order by invitation.created_at, invitation.id
        limit 1
      `
    )[0]
  : undefined;
```

This deliberately avoids hardcoding either seed UUID: the guest button always
resolves to the demo invitation belonging to whichever demo host is *not*
shown, so it stays correct even if the seed data changes order later. With
today's seed (`src/lib/demo/reset.ts:55-68`) this resolves to Juan González
as `demoHost` and The Oteros' invitation as `demoGuestInvitation`.

## Step 3 — Render exactly two demo buttons + gate Google

Replace `sign-in/page.tsx:55-68`:

```tsx
<div className="postcard__actions">
  {!demoMode ? <SignInButton locale={locale} /> : null}

  {demoHost ? (
    <form action={`/${locale}/demo-enter`} method="post">
      <input name="hostId" type="hidden" value={demoHost.id} />
      <button
        className="postcard__button postcard__button--secondary"
        data-testid="demo-enter-host"
        type="submit"
      >
        {demoT("enterAs", { name: demoHost.display_name })}
      </button>
    </form>
  ) : null}

  {demoGuestInvitation ? (
    <form action={`/${locale}/demo-enter-guest`} method="post">
      <input name="invitationId" type="hidden" value={demoGuestInvitation.invitation_id} />
      <button
        className="postcard__button postcard__button--secondary"
        data-testid="demo-enter-guest"
        type="submit"
      >
        {demoT("enterAsGuest")}
      </button>
    </form>
  ) : null}

  {callbackError ? (
    <p className="postcard__error" role="alert">{callbackError}</p>
  ) : null}
</div>
```

Note the `data-testid`s are now fixed strings (`demo-enter-host`,
`demo-enter-guest`) rather than derived from `display_name.toLowerCase()` —
this also fixes the pre-existing bug where Juan González's testid contained
an accent and Jordan Lynn's contained a space (`demo-enter-juan gonzález`),
neither of which any test currently depends on (verified: no test file
references either testid).

## Automated success criteria

- `pnpm run typecheck ; pnpm run lint ; pnpm run test` all pass.
- No unit test currently asserts on the old two-host-button rendering
  (verified in research: none exists), so no test updates are required here
  beyond what phases 1-3 already added.

## Manual success criteria

- Visit `/en/sign-in` and `/es/sign-in` with `DEMO_MODE=true` (local dev):
  exactly two buttons render ("Enter as Juan González" / "Enter as Guest" in
  en; "Entrar como Juan González" / "Entrar como invitado" in es), no Google
  button.
- Visit with `DEMO_MODE` unset/false: only the Google button renders, no demo
  buttons — confirms the gate didn't accidentally invert.
