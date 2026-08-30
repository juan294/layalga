# Phase 3: Web surfaces, i18n, authentication `[batch-eligible]`

Days: 2026-09-06 to 2026-09-07, in parallel with Phase 4. Owns `src/app/**`
except `src/app/api/ticks/route.ts`, plus `messages/**`, `src/i18n/**`,
`src/proxy.ts`, `tests/e2e/**`. Depends on Phase 2.

## Goal

The host view, the guest link page, English and Spanish from the first
screen, Google sign-in for hosts and guests, the link-token path, the demo
host switch, and the Paper Ink look.

## Tasks

- [x] 3.1 next-intl wiring per the verified layout: `src/i18n/routing.ts` (`locales ['en','es']`, `defaultLocale 'en'`), `navigation.ts`, `request.ts` using `next/root-params`, `src/proxy.ts` composing `createMiddleware(routing)` with the Supabase `updateSession` cookie refresh; matcher excludes `api`, `auth`, `_next`, `_vercel`, files. `messages/en.json` and `messages/es.json` with every UI string; no hardcoded copy in components.
- [x] 3.2 Supabase Auth: `src/lib/supabase/server.ts` and `client.ts` with `@supabase/ssr`; `app/auth/callback/route.ts` (PKCE exchange, outside `[locale]`); `app/[locale]/sign-in/page.tsx` with Google button; host mapping by `hosts.auth_user_id` (email allow-list `HOST_EMAILS` env for the first sign-in claim).
- [x] 3.3 Google OAuth client (D2): via Chrome automation on the owner's Google Cloud project create an OAuth 2.0 Web client "L'Ayalga" with authorized redirect URIs `https://hyyrnpyidipkuhakeiyb.supabase.co/auth/v1/callback`, `http://localhost:54321/auth/v1/callback`, and `http://localhost:54621/auth/v1/callback`; enable the Google provider on the Supabase project with the client id and secret (Supabase MCP or dashboard); add `http://localhost:3000/auth/callback` and `https://layalga.thecreativetoken.com/auth/callback` to the redirect allow list; mirror into `supabase/config.toml` with `env()` indirection for the secret. Record the client id in `.env.local`; never in the repo.
- [x] 3.4 Demo host switch: `app/[locale]/(host)/demo-enter/route.ts` sets a signed `layalga_demo_host` cookie (`DEMO_SESSION_SECRET`, 12 h) only when `DEMO_MODE=true` and the host belongs to a `demo` home; `src/lib/auth/current-host.ts` resolves Google session first, demo cookie second.
- [x] 3.5 Host view `app/[locale]/(host)/page.tsx`: month calendar with both hosts' visits (server component reading `visits` and `visit_rooms`), status chips (hold, confirmed, reconfirm pending, reconfirmed, escalated), a "Pending decisions" panel listing `pending_decisions` with the policy reason, the party summary, and Approve or Decline buttons (server actions calling `getAgentClient().run({ task: 'resume', ... })`), a "Capture invitation" form (textarea, submit runs `host_capture`, shows the structured result and the guest link with a copy button), an "Activity" feed from `audit_events` and `notifications` for hosts, and the "Synthetic demo" banner with the clock panel when `DEMO_MODE` (clock panel calls Phase 4's `/api/demo/clock`; the panel component renders the current demo time and two preset warp buttons for beat 4 plus a datetime input).
- [x] 3.6 Guest page `app/[locale]/g/[token]/page.tsx`: resolves the party by token hash; states: invited (date picker constrained to `find_visit_options` results fetched through a server action, party details form, submit runs `guest_submit`), held or confirmed (summary, rooms count not names, "another party will also be at the house" note when applicable without family names, "Request a change" textarea running `guest_change`), reconfirmation pending (the chase message from `notifications`, "Yes, we are coming" button that runs the deterministic reconfirm, "Request a change"), reconfirmed, escalated, cancelled. Optional "Sign in with Google to keep this link" claim.
- [x] 3.7 Run polling: `app/[locale]/runs/[id]/status` route or a client component polling `/api/runs/[id]` every 1.5 s until `completed`, `interrupted`, or `failed`, with the message stream summarized (last assistant message).
- [x] 3.8 Paper Ink design: load the `frontend-design` skill before styling; `next/font/google` Fraunces (display) plus Inter (text) plus JetBrains Mono (data); palette off-white paper, ink black, one accent (deep teal); ruled borders, generous margins, no gradients; both themes via `prefers-color-scheme`. Locale switcher in the header.
- [x] 3.9 Playwright: `tests/e2e/guest-link.spec.ts` and `tests/e2e/host-view.spec.ts` against `pnpm dev` with `AGENT_RUNTIME=local`, `MODEL=scripted` (env switch in `buildAgent` for tests) and the demo seed: capture form shows the structured invitation and link; guest link places a hold and shows confirmation; the pending decision appears and Approve resumes; locale switch renders Spanish copy.

## Pseudocode: approve action

```ts
"use server";
export async function decide(
  decisionId: string,
  approved: boolean,
  note?: string,
) {
  const host = await requireHost();
  const pd = await db
    .update(pendingDecisions)
    .set({
      status: approved ? "approved" : "declined",
      decidedByHostId: host.id,
      decidedAt: new Date(),
      note,
    })
    .where(
      and(
        eq(pendingDecisions.id, decisionId),
        eq(pendingDecisions.status, "pending"),
      ),
    )
    .returning();
  if (!pd[0]) throw new Error("already decided");
  const run = await getAgentClient().run({
    task: "resume",
    homeId: host.homeId,
    sessionId: pd[0].agentSessionId,
    responses: [
      {
        interruptId: pd[0].interruptId,
        response: { approved, hostId: host.id, note },
      },
    ],
  });
  revalidatePath("/[locale]", "layout");
  return run;
}
```

## Verification

Sequential: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`,
`pnpm run build`, then `pnpm run test:e2e`.

Manual: visual review of both pages in both locales and both color schemes;
Google sign-in round trip on localhost with the real client (3.3).

## Exit criteria

- Playwright smoke green.
- Google sign-in works locally for a host email in `HOST_EMAILS`.
- No string outside `messages/*.json` reaches the UI (lint rule or a grep
  check in CI for `>[A-Z][a-z]+ ` inside `src/app` JSX is acceptable).

STOP and wait for confirmation.
