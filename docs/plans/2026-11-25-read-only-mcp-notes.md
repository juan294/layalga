# Read-only MCP endpoint: implementation notes

Plan: `2026-11-25-read-only-mcp.md`. Phase file: `phase-1.md` in `2026-11-25-read-only-mcp-phases/`.

## Phase 1: token policy and bearer resolver (2026-11-25)

Status: implemented and reviewed locally. **One acceptance item is open** (A1) and needs an owner decision. Not pushed, not merged.

### Open acceptance item

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
- Activation must prove that hosted Auth is v2.198.0 or later. The spike recorded v2.198.0 for the hosted project; this phase read no hosted state. Phase 4 should add the check to the activation runbook.

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

Codes of `GET /user` for a client token on v2.198.0 and v2.196.0: revoked grant `session_not_found`, deleted user `user_not_found`, banned user `user_banned`, unverifiable token `bad_jwt`, all with HTTP 403. A soft-deleted row (`deleted_at` set directly) still answers 200; the product does not use soft deletion. Scope `openid` alone works, and its ID token has no email. The substituted role keeps `/user`, refresh and owner revocation working, so the fallback was not needed. The Data API answers 401 because the role does not exist.

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
| 15: a request refused for the minute also spends the day window; a web token with an empty or null `client_id` would be refused | Accepted as the literal plan. Owner information. Recheck the second before activation |
| N1 to N7 of the second round | Repaired |
| Simplify: shared fixtures, `decodeJwt`, schema reuse, key outage boundary, allowlist module, one rate statement, one sign-up for each fixture | Applied |
| Simplify: share the local-URL check and Google identity insert with existing E2E helpers, move the push guard to `scripts/`, rethrow code faults, typed parameters, parallel test loops | Rejected: outside the phase, or the guard would match itself, or no precedent, or no useful gain |

Each rule of the hook, the resolver and the limiter was removed in turn, and a test failed each time (18 hook and 35 TypeScript changes; one further change is equivalent).

### Evidence

Candidate `325edc5`, CLI 3.3.0, hook and OAuth server on, disposable stack `layalga-mcp1`, in this order, all with exit 0: bootstrap; typecheck; lint; `pnpm run test` (1,304 tests in 204 files); coverage (933 tests, 55.16 % statements); `test:integration` (371 in 55 files); build; E2E (57); local release probes on port 3028; `test:migration:rooms`. No existing test expectation changed. CLI 2.116.0 on `layalga-mcp1b`: 122 of 123 Phase 1 integration tests, see A1. The commit that adds this file changes documents only.

Not run: any hosted read, the Strix scan (it precedes an integration push), and the full suite on CLI 2.116.0.

### Handoff

- **Scope:** Phase 1 only, local. Base `c4dc312`, branch `feat/mcp-phase-1-token-policy`, worktree `/Users/juan/code/layalga-mcp-phase-1`.
- **Manual acceptance:** the owner reads the hook in `supabase/migrations/20261125000100_assistant_access.sql`.
- **Resources:** both stacks are removed. The worktree and branch stay until acceptance. Record: `.rpi/local/mcp-phase-1-resources-2026-11-25.md` in the primary checkout.
- **Overlay:** no `.rpi/project/rpi-implement.md` exists; no declared override was applied.
- **Next:** decide A1, accept Phase 1, integrate locally into `develop`, then Phase 2 in a new session. Phase 2 reads `enabledClient` and `isHostAccount`. Phase 3 must publish the same issuer as `issuerOf` in `assistant-bearer.ts`.
