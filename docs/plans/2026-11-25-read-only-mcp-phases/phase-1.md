# Phase 1: token policy and bearer resolver

Part of the [read-only MCP plan](../2026-11-25-read-only-mcp.md). Nothing user-visible changes.

## Result

A migration adds the access token hook, the client allowlist and the rate table. A server module turns a bearer token into a guest identity or a typed refusal. The hook exists in the database, and Auth calls it only where its configuration says so: local stacks from this phase, production never in this phase.

## Entry

Plan accepted. New worktree and branch from `develop`. Disposable stack with a unique `project_id` and ports. Read `.rpi/rules/supabase.md`, `.rpi/rules/testing.md` and `.rpi/rules/resource-lifecycle.md` first.

## Unit A: migration `<timestamp>_assistant_access.sql` [batch-eligible with Unit B after its interface is fixed]

Files: the migration, `supabase/config.toml`, `src/core/assistant-access/audience.ts` (the TypeScript audience constant, with no import), `src/core/assistant-access/access-token-hook.integration.test.ts`, `src/core/assistant-access/schema.integration.test.ts`, a guard test for `config push`, `package.json` (integration list).

| Object | Definition |
| --- | --- |
| `public.assistant_clients` | `client_id uuid primary key`; `assistant text not null check (assistant in ('claude','chatgpt'))`; `redirect_uri text not null check (redirect_uri ~ '^https://[^,?#[:space:]]+$' and char_length(redirect_uri) <= 500)` (Auth stores callbacks joined by commas and reports them without a query); `enabled boolean not null default false`; `created_at timestamptz not null default now()`. No rows. No foreign key to `auth`, so that a deleted client does not block Auth. |
| `public.assistant_request_windows` | `subject text`, `span text check (span in ('minute','day'))`, `started_at timestamptz not null`, `requests integer not null check (requests > 0)`, primary key `(subject, span)`, `char_length(subject) <= 100` |
| `private.access_token_hook(event jsonb) returns jsonb` | `language plpgsql`, `stable`, `security invoker`, `set search_path = ''` |
| `private.apply_data_retention` | Wrapped as in `supabase/migrations/20261121000200_stay_requests.sql:66`. Also deletes windows with `started_at < p_now - interval '2 days'` and returns `deletedAssistantWindows`. |

Grants: RLS on both tables. Revoke all from `public, anon, authenticated, service_role, layalga_agent_runtime, layalga_web_runtime`. `layalga_web_runtime`: `select` on `assistant_clients`; `select, insert, update` on `assistant_request_windows`, each with a policy. `supabase_auth_admin`: `usage` on `private` and `public`; `select` on `assistant_clients`; `select (auth_user_id)` on `hosts`; `select (normalized_email)` on `host_identity_claims`; `execute` on the hook; a `for select` policy on each of the three tables. Revoke hook execution from every other role, including both runtime roles. The web role cannot write the allowlist: only the administrative connection activates a client.

```text
@ private.access_token_hook(event) -> {claims} or {error}
ctx: called by supabase_auth_admin inside the token transaction, 2 s limit
pre: web branch reads no table and cannot raise
do:
  1. validate event.claims has client_id, or event.authentication_method starts with "oauth_provider/"
  2. lookup client row enabled, and auth.oauth_clients (deleted_at null, redirect_uris equal to the row's single callback)
  3. lookup host by user_id, or prepared host email from claims.email
  4. compute claims: aud = MCP URL, role = layalga_assistant, email = "", phone = "", drop user_metadata, app_metadata, amr; keep client_id
br: no client signal -> return event unchanged
fail: any failed check, bad UUID or caught exception -> {error: {http_code: 403, message: "assistant connection refused"}}
risk: query_canceled is not caught by OTHERS; the client request then fails with 500, the web branch is not affected
```

Rules the migration must keep: `client_id` is in the output exactly when it was in the input; a method of `oauth_provider/…` with no `client_id` is refused; no client path returns `aud = authenticated`; the refusal message names no reason, because a vendor sees it. The audience literal is `https://layalga.thecreativetoken.com/api/mcp`.

`supabase/config.toml`: enable `[auth.hook.custom_access_token]` (line 287) with `pg-functions://postgres/private/access_token_hook`, `[auth.oauth_server]` (line 376) with `enabled = true`, `allow_dynamic_registration = false`, path `/oauth/consent`. Add a comment that this file configures local stacks only. Enabling the hook locally makes every local sign-in, E2E run and probe a hook regression test.

Rollback migration text goes in the runbook (Phase 4), not in `supabase/migrations`: disable the hook in hosted settings first, then drop the function. Dropping the function while the hook is enabled stops all sign-in.

## Unit B: bearer resolver [batch-eligible]

Files: `src/lib/auth/assistant-bearer.ts`, `assistant-bearer.test.ts`, `assistant-bearer.integration.test.ts`, `src/lib/auth/host-account.ts` with its integration test, `src/core/assistant-access/rate-limit.ts` with its integration test, `src/lib/auth/session-user-callers.test.ts`, `package.json` and lock file (`jose` 6.2.10).

```text
@ resolveAssistant(authorizationHeader, deps) -> {ok, principal{userId, clientId, assistant}} | {refused} | {unavailable} | {limited, retryAfter}
ctx: JWKS, DB, GET /auth/v1/user, injected clock
pre: header only; cookies and query are never read
do:
  1. parse exactly one "Bearer <jwt>"
  2. validate ES256 signature, issuer, exp, iat, string aud equal to the constant, sub, client_id and session_id UUIDs (5 s tolerance)
  3. lookup enabled assistant_clients row and host status
  4. write rate windows
  5. lookup /user with publishable key and token, 3 s limit
  6. validate user.id equals sub, verifiedGoogleGuestEmail is set, not a host email
br: /user with a known code (session_not_found, user_not_found, user_banned, bad_jwt) -> refused; every other non-200, timeout, JWKS or DB error -> unavailable
fx: rate windows
risk: no identity cache, so that revocation is immediate
```

`isHostAccount(userId, email)` in `host-account.ts` checks `hosts.auth_user_id` and the normalized email in `host_identity_claims`. The consent page and the resolver use it; the hook has the same rule in SQL. One test matrix feeds both implementations.

`takeRequest(userId, clientId, now)` runs one transaction in a fixed order: the `account:<user>:<client>` minute window, its day window (24 hours from the first request), then, only when both allow the request, the `client:<client>` minute window. A window restarts when its span has ended. It returns `allowed`, or the seconds until every exceeded window has ended. Use the injected clock, not `now()`.

Logs: `[ASSISTANT_AUTH]` with outcome category and `assistant` only. Never a token, user ID, email or argument.

## Tests first

| Test | It fails when |
| --- | --- |
| Hook, web event: `private.access_token_hook(e)::text = e::text`, evaluated in SQL, for password, OAuth, refresh and recovery methods | the web branch changes a claim |
| Hook, web event as `supabase_auth_admin`, connected as local `supabase_admin` (the pattern in `src/core/booking/invitations.integration.test.ts:39`), in one transaction: revoke its table and column grants (keep `usage` and `execute`), rename the three tables, `set local role`, call, roll back. A client event in the same state is refused | the web branch reads a table |
| Hook, client event: allowed; disabled; unknown; deleted client; two callbacks; one different callback; lookalike domain; host by ID; host by prepared email in another case; malformed `client_id`; null `client_id`; provider method with no `client_id` | a refusal rule is missing |
| Hook output for an allowed client: `client_id` kept, exact `aud`, role, empty email and phone, no metadata; required claims present | a claim rule regresses |
| Live on the stack with the hook on: Google-linked user signs in and refreshes; code flow with scope `openid` gives the audience; refresh keeps it; guest becomes host, then refresh fails; the failed refresh token works again after the host binding is removed | Auth behavior differs from the source reading |
| ID token for `openid` contains no email | the scope choice leaks an address |
| Data API with the client token: refused on every public table, and on a probe table granted to `authenticated` inside the test | the role substitution has no effect |
| With the substituted role: `GET /user` and refresh work for the client, and the owner's web session can revoke the grant. The client token itself still gets 403 from grant endpoints | hardening breaks Auth. Fallback: keep `authenticated`, keep the grant guard, record the deviation |
| `authenticated` and `anon` hold no privilege on any public table, and no executable public function | a later migration widens client power |
| Table privileges for each role, including denials for agent, anon, authenticated, service role; web role cannot write `assistant_clients` | a grant is wrong |
| Resolver matrix: missing, malformed, two headers, cookie only, query only, HS256, `alg: none`, other key, other issuer, expired, aud array, aud `authenticated`, aud with trailing slash, no `client_id`, disabled client, host, prepared host, unconfirmed email, non-Google account, mismatched `/user` id, revoked grant, `/user` 500, 429, unknown 401 (invalid publishable key), timeout, JWKS down, DB down. Record the real codes for revoked grant, deleted user and banned user from the local stack | a check is missing or an outage becomes a 401 |
| Rate windows: 60th allowed, 61st limited, next minute allowed, day limit, client limit across two users, an account over its limit leaves the client count unchanged, concurrent calls count exactly and do not deadlock | the counter is not atomic |
| Guard: only `assistant-bearer.ts` fetches a URL that ends in `/user`; its own test proves the pattern matches `${issuer}/user` and `/auth/v1/user` | a second path to client-token identity appears |
| Guard: no script, workflow, package script or Git hook contains `supabase config push` | local settings could reach the hosted project |
| SQL audience literal equals the TypeScript constant | the two drift |

## Automated acceptance

- The full sequence in the plan passes with the hook on, with no change to existing test expectations.
- Integration tests of this phase also pass with Supabase CLI 2.116.0 on a second disposable stack.
- `pnpm run test:migration:rooms` passes.
- Both stacks are removed; the resource record is complete.

## Manual acceptance

Owner reads the hook SQL. No other manual step.

## Not in this phase

No page, route, environment variable or tool.
