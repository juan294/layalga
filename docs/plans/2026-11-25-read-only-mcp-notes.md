# Read-only MCP endpoint: implementation notes

Plan: `2026-11-25-read-only-mcp.md`. Phase files: `phase-1.md` and `phase-2.md` in `2026-11-25-read-only-mcp-phases/`.

## Phase 1: token policy and bearer resolver (2026-11-25)

Status: accepted by the owner on 2026-11-25 and merged locally into `develop`.

### Acceptance item A1 (resolved)

**A1. CLI 2.116.0 does not pass one Phase 1 test.** VERIFIED: CLI 2.116.0 starts Auth v2.196.0. There, 122 of the 123 Phase 1 integration tests pass. `access-token-hook.integration.test.ts` fails where a client token must get 403 from the grant endpoints, because Auth answers 200. The vendor added this refusal in Auth [v2.198.0](https://github.com/supabase/auth/releases/tag/v2.198.0) (2026-11-16, "restrict OAuth client access tokens to OAuth endpoints"). CLI 2.120.0 still starts v2.197.0, and CLI 3.3.0 starts v2.198.0.

A probe on both local stacks with synthetic accounts shows what the old version permits to a client token:

| Action with a client token | Auth v2.196.0 | Auth v2.198.0 |
| --- | --- | --- |
| List its user's grants, revoke a grant | 200, 204 | 403 |
| Approve a second client that is enabled | 200 | No code |
| Approve a client that is not on the allowlist | 403 (hook) | No code |
| Change the password or metadata | 200 | 403 |
| Sign out every session of the user | 204 | 403 |
| Read `/user` | 200 | 200 |

Consequences:

- `develop` CI would fail in the `integration` job, because `.github/workflows/ci.yml` pins 2.116.0. A workflow change follows the Sutura ownership rule, so this phase did not make one and did not weaken the test.
- Activation must prove that hosted Auth is v2.198.0 or later. The spike recorded v2.198.0 for the hosted project; this phase read no hosted state. Gate G0 in `phase-4.md` now requires it.

Resolution: commit `868291d` pins CLI 3.3.0 in `ci.yml`. Sutura answered that it is an ordinary dependency pin. Local evidence only until the first hosted run.

Owner decision (2026-11-25): move the CI pin to CLI 3.3.0 through Sutura before this branch is pushed, keep the test unchanged, and require hosted Auth v2.198.0 or later before activation.

### Deviations

| Plan said | Found | Chose | Why |
| --- | --- | --- | --- |
| Hook refuses a failed check | A client event without an email makes the prepared-host rule impossible to check | Refuse it | Fail closed. Auth supplies the email to the hook for scope `openid` (VERIFIED by the live tests) |
| `{limited, retryAfter}` | Phase 3 logs the assistant for each request | `{status: "limited", assistant, retryAfter}` | No user or client ID: the grant is not proved at that point |
| `takeRequest(userId, clientId, now)`, one transaction | Three upserts cost eight serial round trips and held row locks between them | One statement of chained parts, with a `database` argument first | Still one transaction in the fixed order |
| A 200, 429 or other answer by status | An invalid publishable key is accepted by the local gateway (VERIFIED: 200) | The invalid-key case is a scripted 401 without a known code | The hosted gateway refuses it; local Supabase cannot show it |
| Resolver matrix: cookie only, query only | The resolver receives only the header value, so such a test cannot fail | Moved to the Phase 3 route test, which already lists both | A test must be able to fail |
| "JWKS down" is an outage | An empty key set made every token a refusal | An empty set is unavailable | A short Auth fault must not end connections |
| Google-linked user signs in | Local stacks have no Google sign-in | Password sign-in with a synthetic Google identity | Same method as the existing fixtures |
| Files of the phase | Phase 2 also reads the allowlist; three tests needed the same fixtures | Added `clients.ts`, `assistant-oauth.ts`, `host-account-cases.ts` and `local-supabase.ts`; widened the `verifiedGoogleGuestEmail` parameter to accept null | Reuse |
| Guard matches a `fetch` whose URL ends in `/user` | A URL can be built before `fetch` | Any string that ends in `/user` or `/userinfo` | Wider than the plan |
| Retention deletes old windows | The delete could deadlock with a request that counts | The delete skips locked rows | The next run removes them |

### Facts recorded from local Auth

Codes of `GET /user` for a client token on v2.198.0 and v2.196.0: revoked grant `session_not_found`, deleted user `user_not_found`, banned user `user_banned`, unverifiable token `bad_jwt`. All came with HTTP 403 on v2.198.0; the status was not recorded on v2.196.0. A soft-deleted row (`deleted_at` set directly) still answers 200; the product does not use soft deletion. Scope `openid` alone works, and its ID token has no email. The substituted role keeps `/user`, refresh and owner revocation working, so the fallback was not needed. The Data API answers 401 because the role does not exist.

### Review

One independent read-only review returned 15 findings on `1eeb2be`, then 7 on the repairs, and ended with APPROVED apart from A1. Four simplify reviewers read `b59202b`.

| Finding | Disposition |
| --- | --- |
| 1 HIGH: the rate limiter failed on the production database client, which returns timestamps as text | Reproduced (7 tests failed), repaired. The tests use that client |
| 2 to 8, 11, 12: weak tests, timeouts, clean-up, mixed stacks | Repaired |
| 9: lock order of the migration | Repaired. `lock_timeout` rejected: optional, no precedent |
| 10: empty key set, trailing slash | Repaired |
| 13: guard gaps | Repaired |
| 14: round trips, log category, comment | Repaired, except the merge of the client and first host query: it would copy the host rule. `DataRetentionResult` unchanged: existing drift, the key is additive |
| 15: a request refused for the minute also spends the day window; a web token with an empty or null `client_id` would be refused | The owner accepted the minute and day rule on 2026-11-25. Recheck the second before activation |
| N1 to N7 of the second round | Repaired |
| Simplify: shared fixtures, `decodeJwt`, schema reuse, key outage boundary, allowlist module, one rate statement, one sign-up for each fixture | Applied |
| Simplify: share the local-URL check and Google identity insert with existing E2E helpers, move the push guard to `scripts/`, rethrow code faults, typed parameters, parallel test loops | Rejected: outside the phase, or the guard would match itself, or no precedent, or no useful gain |

The repairs after the second round (`e14dba1..325edc5`) were read again by the coordinating session on 2026-11-25, without running tests: no defect found.

Each rule of the hook, the resolver and the limiter was removed in turn, and a test failed each time (18 hook and 35 TypeScript changes, on `e14dba1` before the last repairs; one further change is equivalent).

### Evidence

Candidate `325edc5`, CLI 3.3.0, hook and OAuth server on, disposable stack `layalga-mcp1`, in this order, all with exit 0: bootstrap; typecheck; lint; `pnpm run test` (1,304 tests in 204 files); coverage (933 tests, 55.16 % statements); `test:integration` (371 in 55 files); build; E2E (57); local release probes on port 3028; `test:migration:rooms`. No existing test expectation changed. CLI 2.116.0 on `layalga-mcp1b`: 122 of 123 Phase 1 integration tests, see A1. The commit that adds this file changes documents only.

Not run: any hosted read, the Strix scan (it precedes an integration push), and the full suite on CLI 2.116.0.

### Handoff

- **Scope:** Phase 1 only, local. Base `c4dc312`, branch `feat/mcp-phase-1-token-policy`, worktree `/Users/juan/code/layalga-mcp-phase-1`.
- **Manual acceptance:** the owner reads the hook in `supabase/migrations/20261125000100_assistant_access.sql`.
- **Resources:** both stacks are removed. The worktree and branch stay until the push is verified. Record: `.rpi/local/mcp-phase-1-resources-2026-11-25.md` in the primary checkout.
- **Overlay:** no `.rpi/project/rpi-implement.md` exists; no declared override was applied.
- **Next:** Phase 2 in a new session. Phase 2 reads `enabledClient` and `isHostAccount`. Phase 3 must publish the same issuer as `issuerOf` in `assistant-bearer.ts`.

## Phase 2: consent and connected assistants (2026-11-25)

Status: accepted by the owner on 2026-11-26, including limit L1, and merged locally into `develop`. The hosted OAuth server stays off and `ASSISTANT_ACCESS` stays `none` outside tests.

### Deviations

| Plan said | Found | Chose | Why |
| --- | --- | --- | --- |
| The callback gets one branch, for consent | A guest who signs in on `/assistants` would be signed out with "not a host" | `/{locale}/assistants` uses the same branch | Neither page may bind a prepared host |
| Continue needs only the request ID | The account can change behind an open page, and Continue binds the request | Continue also sends the shown account; a difference shows the new account first | "The account is shown before anything is bound" |
| `getSessionUser`, then "unavailable" for an Auth failure | `getSessionUser` gives null for both | `lookUpSessionUser` in the same file tells them apart; `getSessionUser` keeps its results | A guest must not be sent to sign in while Auth is down |
| Earlier consent: `redirect_url` only | VERIFIED: Auth does this only on the first read of an unbound request. A bound request returns details again, and two open requests are decided separately | Tests follow the observed behavior | Plan text is not affected |
| Returned URL has the origin and path of the callback | The allowlist holds no query or fragment | The URL must start with the callback and `?` | Fixes origin and path in one comparison |
| Each state has one next action | For `ended` and `invalid`, the action is in the assistant | Text only, no control | A link would lead away from the useful action |
| Refused hosts can use the website link on the page | `host` offers "Use another account" | The header link "Find a household" is the website link; a browser test asserts it | One next action for each state |
| "Not disconnected, try again" | The second list can fail after a successful revoke | A separate "could not confirm" text | The other text could be false |
| Proxy test | Vitest cannot load the locale middleware of `next-intl` without a global configuration change | The browser spec proves it on the running proxy | Stronger evidence |
| Consent and list files | Logic is in `src/lib/auth/assistant-consent.ts` and `connected-assistants.ts`, with `google-guest.ts`, `oauth-server-errors.ts` and `assistant-consent-deps.ts` | Pages and actions stay thin | Real-Auth tests need injected sessions |
| `referrer` not named | `no-referrer` makes the browser send no origin, so the sign-out form got 403 (reproduced) | `same-origin` | The query still does not reach another site |

### Accepted limit

**L1.** After Auth approved a request (`redirect` and `continue` states), a language change or a reload shows "This request has ended", because the second read answers 400. The guest connects again from the assistant. Before the decision, a language change keeps the request. The plan's row "Guest changes language" promises the same request without this exception. The owner accepted L1 on 2026-11-26: keeping the request would mean storing the authorization code in the browser.

### Facts recorded from local Auth v2.198.0

| Call | Answer |
| --- | --- |
| Unknown, expired or foreign request | 404 `oauth_authorization_not_found` |
| Request already approved or denied, or its client deleted | 400 `validation_failed` |
| Decision on a request that this account has not read | 404 `oauth_authorization_not_found` |
| Dead session | 403 `session_not_found` (auth-js: `AuthSessionMissingError`) |
| Client token | 403 `no_authorization` |
| OAuth server off: grants, details, decision, revoke, authorize | 404 `feature_disabled`; web sign-in still works |
| Grants of a deleted client | Not listed |
| Two approvals with different scopes | One grant with the joined scopes |

Authorization IDs are 32 lowercase letters and digits. The development log showed no authorization ID during the browser run; the ignored request also hides the arguments of its server action.

### Review

One independent read-only reviewer, three rounds: 24 findings on `7689729` (none high, 2 medium), 6 on the repairs (1 medium), none on `f67e726`: approved apart from these notes. The commit after that round (`4eb7309`, one phone layout rule and its test) was read by the author only. Four simplify reviewers read `06b4ab3`.

| Finding | Disposition |
| --- | --- |
| 1 MEDIUM: sign-out fails from consent | Reproduced, repaired, browser test |
| 2 MEDIUM: Continue can bind an account that the page did not show | Repaired, tests on real Auth and in the browser |
| N1 MEDIUM: a new name with an old result in the list | Reproduced, repaired, browser test with a held answer |
| 3, 5 to 12, 15 to 17, 20, 22 to 24, N3 to N6 | Repaired. 17: `off`, `unavailable`, `host` and `redirect` stay outside the layout matrix |
| 4 | Limit L1 |
| 13, 14 | Kept, see Deviations |
| 18, N2 | This section |
| 21: the layout test mocks own modules | Empty assertion removed; mocks kept, the layout has no other seam |
| Simplify: session lookup shared with the layout, request ID rule, enabled rule in SQL, one session check in a disconnect, own CSS module, shared fixtures | Applied |
| Simplify: shared cookie jar, CSP and sign-in helpers with older specs, `RequestAccess` for another namespace, overflow rule on every ledger list, removal of the parsed `assistantAccess` field, fewer theme checks | Rejected: outside the phase, or the plan requires it |

Each rule was removed in turn and a test failed each time: 68 changes on `7689729` and 40 on `7f85ce1`. Three of the 40 survived first; the tests were strengthened and then failed. An equivalent change survived, as it should.

### Evidence

Candidate `4eb7309`, CLI 3.3.0, hook and OAuth server on, disposable stack `layalga-mcp2` after a fresh reset, in this order, all with exit 0: bootstrap; typecheck; lint; `pnpm run test` (1,508 tests in 215 files); coverage (1,109 tests, 56.63 % statements); `test:integration` (399 in 57 files); build; E2E (76, no retry, no flaky test); local release probes on port 3028; `test:migration:rooms`. No existing test expectation changed; the tap-target check moved to a helper. The commit that adds this section changes documents only.

`tests/e2e/guest-link.spec.ts:15` passed. This phase does not change that path, except that the layout makes its one Auth lookup through a new function.

Not run: any hosted read, a real Google or Claude sign-in, the production server with consent (Phase 3 adds that smoke), a screen reader, and the Strix scan (it precedes an integration push).

### Found outside the phase

INFERRED: `src/app/[locale]/guest/verify/page.tsx` also sets `no-referrer`, so its sign-out button should fail in the same way. Not changed here.

### Handoff

- **Scope:** Phase 2 only, local. Base `792c2d1`, branch `feat/mcp-phase-2-consent`, worktree `/Users/juan/code/layalga-mcp-phase-2`. Merged locally into `develop` on 2026-11-26.
- **Manual acceptance:** the owner reads both pages in both languages and both themes. Screenshots: `.rpi/local/mcp-phase-2-screenshots` in the worktree (ignored by Git), eight `sheet-*.png` files and 72 single images, rendered from `4eb7309` with synthetic accounts.
- **Resources:** the stack and the mutation worktree are removed; readback was zero. The worktree and branch stay until the push is verified. Record: `.rpi/local/mcp-phase-2-resources-2026-11-25.md` in the primary checkout.
- **Overlay:** no `.rpi/project/rpi-implement.md` exists; no declared override was applied.
- **Next:** Phase 3 in a new session. `ASSISTANT_ACCESS` exists; Phase 3 adds only its `APP_URL` check. Phase 4 step 6 can rely on the `not_allowed` text for a disabled client.

## Phase 3: MCP endpoint and read tools (2026-11-26)

Status: implemented locally, waiting for owner acceptance. The hosted OAuth server stays off and `ASSISTANT_ACCESS` stays `none` outside tests. Nothing was pushed.

### Deviations

| Plan said | Found | Chose | Why |
| --- | --- | --- | --- |
| Files of the phase | The route and the metadata route need the same issuer, resource URL and challenge | `src/mcp/resource.ts`; `assistantEndpoint` and `withoutTrailingSlash` next to the audience constant; `issuerOf` exported from `assistant-bearer.ts`; `isPlainObject` in `src/lib/json-object.ts`; `localWebDatabaseUrl` in the test fixtures | One definition of each URL rule |
| The official client calls the tools "over HTTP on the running route" | A test cannot give `next start` a fake clock or a failing `/user` | The client calls the route module (`POST`) through its `fetch` option. The rate limit and outage tests call `serveMcp` with the live resolver and a fake clock or a failing fetch. `scripts/smoke-assistant-routes.sh` proves the rewrites and the dark state on `next start` | Same handler; the smoke covers the server |
| `historyUrl` is `<APP_URL>/requests` | `pageUrl` and `continueUrl` also need a language | All three links have no locale. On a dev server, `/requests` and `/stays/<handle>?<terms>` answered 307 to `/en/...` or `/es/...` by `Accept-Language`, with the query kept (VERIFIED) | One link for both languages |
| Readiness reports `APP_URL` | `parseServerEnvironment` could also throw | Readiness only, for the production web contract | A wrong value must not stop the website; `/api/health` is degraded |
| `search_stays` takes JSON integers | The shared lookup also accepts decimal strings for the website forms | The tool refuses counts that are not JSON integers and parses the criteria itself before the lookup | Plan text; the parsed query builds `continueUrl` |
| Each set of room terms appears once | Two rooms of one stay can have the same terms | The stay lists the label twice | The room count stays true |
| Wrong content type | No status in the plan | 415 | HTTP rule |
| 2026-07-28 requests | The SDK requires `Mcp-Method` and, for `tools/call`, `Mcp-Name` (VERIFIED: 400 with `-32020` without them) | Raw test requests send them; the official client sends them itself | Era rule |
| 2025-11-25 answers | The SDK returns the SSE answer before the tool runs, so the log said `ok` for an outage (reviewer finding 1, reproduced by a red test) | The route reads the answer whole before the log line and drops the `connection` header | A buffered answer holds nothing open: `subscriptions/listen` is refused before dispatch and `keepAliveMs` is 0 |
| Challenge text | A header value cannot hold `’` (VERIFIED: `TypeError` ByteString) | `error_description` names no product | Header rule |
| `[MCP_REQUEST]` logs the method | A caller chooses the method text | Known methods only, else `other`; the tool name only when it is one of the three | No caller text in logs |
| The size test uses 20 rooms and 12 stays | The answer is built from the lookup result | A unit test with a typed lookup result and every room text at its stored maximum | No database needed for the size |
| The smoke is named in the plan | `next start` also reads `.env`, `.env.local`, `.env.production` and `.env.production.local` | The script stops with BLOCKED when one exists, clears the environment with `env -i`, and is not a `package.json` script | Run it where no env file can switch assistants on |

### Review

One independent read-only reviewer, two rounds: 7 findings on `f0e23f2` (1 medium), 2 on the repairs, approved on `57b2ed1`. Four simplify reviewers (reuse, simplification, efficiency, altitude) read `5fe94b9`.

| Finding | Disposition |
| --- | --- |
| 1 MEDIUM: a 2025-era tool call logs `ok` and too short a time | Reproduced with a red test, repaired in `57b2ed1` |
| 2: the smoke depends on env files in its folder | Repaired |
| 3: the value scan omits the notes canaries | Repaired: `CANARY` is a forbidden value |
| 4: an either-or description test | Repaired |
| 5: caller-chosen method names in the log | Repaired |
| 6: wrong audience only through a web token at the route | Kept: a client token with another `aud` needs the Auth signing key; Phase 1 resolver tests pin the audience check |
| 7: Phase 3 deviations missing | This section |
| 8: `connection` header on a buffered answer | Repaired with a test |
| 9: a client that leaves during a call gets a 500 that nobody reads | Kept: the log stays correct and nothing leaks |
| Simplify: one trailing-slash helper, the SDK's metadata URL, one tool lookup, the parsed query for the link, a hoisted name schema, one JSON-RPC error helper, statuses from one list, one room row, the option window constant, a shared record guard, `setPublicListing`, one teardown stack, the shared web runtime URL, smaller test assertions | Applied in `4b5a334` |
| Simplify: zod parsers for the argument shapes, a looser WebMCP schema type, one request builder for two test files, a buffered body built once, memoized dependencies, seeding the rate window, one OAuth flow for several tests, `Promise.all` in the resolver, deriving the allowed keys from the output schemas | Rejected: three tools do not need a parser layer; outside the phase; the two builders differ; microseconds per request; the full 60-call run proves each request counts once and the file takes under 2 seconds; tests stay isolated; the key list is the test's own oracle |

Each rule was removed in turn and a test failed each time: 33 changes on `f0e23f2`, then 35 on `4b5a334`. One survived on `4b5a334` (the tool's own parse of the criteria); three cases were restored to the "before any lookup" list in `e9c805b`, and it then failed.

### Evidence

Candidate `e9c805b`, CLI 3.3.0, Auth v2.198.0, hook and OAuth server on, disposable stack `layalga-mcp3` after a fresh reset, in this order, all with exit 0: bootstrap; typecheck; lint; `pnpm run test` (1,616 tests in 222 files); coverage (1,204 tests, 57.89 % statements); `test:integration` (412 in 58 files, including `src/mcp/endpoint.integration.test.ts`); build; `SMOKE_PORT=3048 bash scripts/smoke-assistant-routes.sh` (11 checks on `next start`); E2E (76, no retry, no flaky test); local release probes on port 3048 (11 passed); `test:migration:rooms`. No existing test expectation changed; `actions.test.ts` is unchanged. The commit that adds this section changes documents only.

`tests/e2e/guest-link.spec.ts:15` passed. This phase does not touch that path.

The endpoint tests ran the official client 2.3.1 in both eras against real Auth tokens, with the web runtime role as `DATABASE_URL`. Not run: any hosted read, a real Claude or ChatGPT connection, a real Google sign-in, and the Strix scan (it precedes an integration push).

### Handoff

- **Scope:** Phase 3 only, local. Base `3287a0a`, branch `feat/mcp-phase-3-endpoint`, worktree `/Users/juan/code/layalga-mcp-phase-3`. Not merged into `develop`.
- **Manual acceptance:** none in the plan. The owner can read `src/mcp/tools.ts` for the tool descriptions and recovery texts, which assistants show to guests.
- **Resources:** record `.rpi/local/mcp-phase-3-resources-2026-11-26.md` in the primary checkout. The stack and the mutation worktree are removed at the end of this phase; the record has the readback.
- **Overlay:** no `.rpi/project/rpi-implement.md` exists; no declared override was applied.
- **Next:** Phase 4 in a new session after acceptance: the browser run from 401 to a tool result to disconnect, the privacy, architecture and runbook documents, and the bundle check. The bundle now also contains `src/core/assistant-access/audience.ts` (two exports, no import) through `env.ts`; nothing from `src/mcp` or the resolver.
