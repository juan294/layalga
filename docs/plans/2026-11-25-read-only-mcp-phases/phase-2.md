# Phase 2: consent and connected assistants

Part of the [read-only MCP plan](../2026-11-25-read-only-mcp.md).

## Result

A guest can approve or refuse an assistant on `/{locale}/oauth/consent` and see or disconnect assistants on `/{locale}/assistants`. While `ASSISTANT_ACCESS` is `none`, consent says that connections are switched off and links to the assistants page, and no other page links to it. The assistants page depends only on the OAuth server.

## Entry

Phase 1 accepted. Read the Next.js guides for route segments, server actions and `cookies()` in `node_modules/next/dist/docs/` before writing code.

## Unit A: sign-in return [batch-eligible]

Files: `src/lib/auth/safe-next-path.ts` and test, `src/app/auth/callback/route.ts` and tests, `src/components/frontend-utils.ts` and test (locale switch keeps a validated `authorization_id`), `next.config.ts` and test (request-log filter).

`isAssistantConsentPath(value)`: `/(en|es)/oauth/consent?authorization_id=` followed by 16 to 128 characters of `[A-Za-z0-9_-]`, no other parameter, no fragment. Auth makes 32 alphanumeric characters (SOURCE). The callback gets one branch beside the requester branch: a verified Google guest returns to the path. It does not call `claimHostForUser`, so a prepared host is not bound from an assistant flow. A failed sign-in returns to the same path with `auth=failed`, through the mechanism that `isRequesterPath` uses; the predicate is exact, so the page reads `auth` and rebuilds the clean path for the retry.

## Unit B: consent page

Files: `src/app/[locale]/oauth/consent/page.tsx`, `actions.ts`, `actions.test.ts`, `page.test.tsx`, `src/components/guest/assistant-consent.tsx`, `src/lib/auth/assistant-consent.ts`, `messages/*.json` namespace `Assistants`, `src/lib/server/env.ts` and test (this phase adds the `ASSISTANT_ACCESS` mode), `playwright.config.ts`.

Hosted Auth redirects to `site_url` plus `/oauth/consent` (SOURCE). The proxy adds the locale; a test proves it keeps `authorization_id`.

```text
@ loadConsent(authorizationId) -> state
ctx: cookie session, Supabase oauth API, DB
pre: ASSISTANT_ACCESS=on, else "off"
do:
  1. validate authorization_id format -> "invalid"
  2. lookup getSessionUser and verifiedGoogleGuestEmail -> "sign_in"
  3. lookup isHostAccount -> "host"
  4. emit "start": account shown, Continue and Use another account; GET stops here
  5. lookup getAuthorizationDetails(authorizationId) after the guest presses Continue (server action)
  6. lookup enabled client by client.id with redirect_uri exactly equal -> "not_allowed"
br: redirect_url only (earlier consent) -> "continue" with a visible link, if its origin and path match an enabled callback; never automatic navigation
fail: by error code: feature_disabled -> "off"; 401, 403 or no session -> "sign_in"; not found, expired or no longer pending -> "ended"; other -> "unavailable"
risk: step 5 binds the request to this account and approves an earlier consent, so a page load alone must not reach it
```

"Use another account" starts Google sign-in again with the same return path; it works because nothing is bound yet. The start step says: "Continue only if you just started this in your assistant. If somebody sent you this link, close this page." In the "continue" state the response contains no client ID, so the match is by callback among enabled rows.

`decideAssistantAccess(authorizationId, decision)` is a server action. It repeats steps 1 to 3, 5 and 6, then calls `approveAuthorization` or `denyAuthorization` with `skipBrowserRedirect: true`, checks that the returned URL has the origin and path of the enabled callback, and returns `{ status: "redirect", url }`. The client calls `window.location.assign(url)` and also renders the URL as a visible link. No form posts across origins, so `form-action 'self'` (`src/proxy.ts:17`) does not change and no CSP exception is added. The URL is never logged.

The page shows, in English and Spanish: the assistant name from `assistant_clients` (never the self-asserted client name); the callback domain in full, for example `claude.ai`; the signed-in Google account; what the assistant can read (listed households, dates, rooms, the status of this account's requests); what it cannot do (send, change or withdraw a request); the sentence that Anthropic or OpenAI receives these answers, and that through the sign-in service it could also read the account's name, email and picture; the sentence that signing out of L’Ayalga does not disconnect it, with a link to the assistants page; requested scopes other than `openid` and `offline_access`, listed in plain words; "Allow" and "Do not allow". The two buttons have equal weight.

States `host`, `not_allowed`, `ended`, `invalid`, `off`, `continue` and `unavailable` each have their own text and one next action. None of them redirects to the client's callback.

## Unit C: connected assistants [batch-eligible after Unit B messages exist]

Files: `src/app/[locale]/assistants/page.tsx`, `actions.ts`, tests, `src/app/[locale]/layout.tsx` (one link).

The page requires a verified Google session and works for hosts too, because a guest can become a host after connecting. It calls `supabase.auth.oauth.listGrants()` after `getSessionUser`, shows the name (from `assistant_clients` when known, else the client name as plain text with "unrecognized"), the connection date and "Disconnect". The action calls `revokeGrant({ clientId })`, then reads the list again and reports success only if the client is absent. It accepts a client ID only from the caller's current list. `feature_disabled` gives the "switched off" state. The page ignores `ASSISTANT_ACCESS`.

The header link (`src/app/[locale]/layout.tsx:141`) shows only with `ASSISTANT_ACCESS=on` and `canFindStays`. The layout makes no new Auth call.

Page text: disconnecting takes effect at once; signing out does not disconnect; if the assistant still shows a connection, remove and add it there; Claude Code is not supported.

## Tests first

| Test | It fails when |
| --- | --- |
| `isAssistantConsentPath` accepts both locales and refuses extra parameters, duplicate ID, fragment, encoded slash, control characters, 15 and 129 characters | open redirect or lost request |
| Callback: guest returns to consent; failed and cancelled sign-in keep the request; prepared host is not claimed; all existing route tests unchanged | return flow breaks |
| Proxy: `/oauth/consent?authorization_id=X` redirects to a locale and keeps the query | hosted redirect loses the ID |
| A page load never calls `getAuthorizationDetails`, for any account; anonymous, non-Google, host and prepared host also cannot reach it by the action. After a load by account A, account B can still complete the request | a refused account binds or auto-approves a request |
| Client named "Claude" with another callback; known client with a changed callback; disabled client: refusal, no redirect, client name not rendered as trusted | impersonation |
| Cookie holds a client token: page treats it as signed out (extends the existing rejection) | condition 1 regresses |
| Earlier consent: no code exists after page load; after Continue, the browser does not navigate until the guest follows the link | a link alone approves access |
| Locale switch on the consent page keeps a valid ID and drops an invalid one | changing language loses the request |
| Error codes map to their states, including `feature_disabled` as 404 and a dead session | a guest loops on the wrong advice |
| Action: replays, other account, expired request, approve then deny, returned URL with another origin | unsafe navigation |
| Browser: approve and deny end at the intercepted `https://claude.ai/**` route with no CSP violation in the console; link works with navigation blocked | CSP or fallback fails |
| Assistants: list, disconnect, failed revoke keeps the row, forged client ID refused, two accounts see only their own, host who was a guest can disconnect, feature disabled | revocation is wrong |
| Sign-out route: existing tests unchanged, and the grant still exists afterwards | the owner decision regresses |
| Both pages at 390 px and desktop, light and dark, both locales: accessible names, focus, 44 px targets | usability regression |

## Automated acceptance

The full sequence in the plan passes. The browser tests run against a real OAuth server on the local stack, with a synthetic pre-registered client.

## Manual acceptance

Owner reads both pages in both languages and both themes (screenshots rendered in this phase).
