# Supabase Auth as the sign-in server for ChatGPT and Claude: Phase 1 spike

Date: 2026-11-25. Plan: [ChatGPT and Claude access to guest booking](../plans/2026-11-24-external-agent-access.md). Scope: a disposable local Supabase stack with synthetic accounts. No hosted setting changed and no real ChatGPT or Claude client connected. VERIFIED means observed in this spike; INFERRED means concluded from documentation or source.

## Decision

Use Supabase Auth, with four conditions that must hold before the OAuth server is enabled on the hosted project:

1. Web authentication refuses client tokens (`client_id` present, or an audience other than `authenticated`).
2. An access token hook sets the MCP audience, refuses users bound to a host record, and refuses clients whose callbacks are not on an exact allowlist.
3. The MCP endpoint checks signature, issuer, expiry, audience and `client_id` on every request, then calls `/auth/v1/user` to prove the Google identity and that the grant still exists.
4. A guest can see and revoke connected assistants.

A dedicated provider would add client ID metadata documents, custom scopes and real resource handling. None of these blocks a read-only pilot, and a second identity store costs more than the gap. Revisit the choice if a real client fails on the open points below.

## Environment

VERIFIED: Supabase CLI 3.3.0, Auth v2.198.0, the same version as the hosted project reports. The hosted project signs with ES256 and its OAuth server is disabled (`feature_disabled` from its public metadata endpoint). The local stack also signs with ES256.

## Main finding: a connected app could reach host pages

VERIFIED on unchanged code: an access token issued to a registered third-party client for a host's account, placed in the web session cookie, opened the host dashboard, settings and room pages with real content. An anonymous request to the same pages was sent to sign-in. Setting a different audience through the hook did not prevent it, because `/auth/v1/user` accepts client tokens with any audience.

This is not reachable in production today, because the OAuth server is off.

VERIFIED fix on the spike branch: one helper, `getSessionUser`, calls `getUser()` and then `getClaims()`, and refuses a token with `client_id`, another audience or another subject. After it, every client-token request behaved like an anonymous one and web sessions were unchanged. Seven existing test files (70 tests) fail with the prototype because their Supabase mocks have no `getClaims`; they were not repaired in the spike.

## What a client token can do directly

| Surface                                                                     | Result (VERIFIED)                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Auth: change email, password or metadata                                    | 403                                                        |
| Auth: enroll a factor, link or remove an identity, reauthenticate           | 403                                                        |
| Auth: list grants, approve another client, admin endpoints, global sign-out | 403                                                        |
| Auth: `GET /user` and `/oauth/userinfo`                                     | 200. It reads the account's email, identities and metadata |
| Data API: all 26 public tables                                              | 403, because `authenticated` has no grants                 |
| Public functions executable by `authenticated`                              | None                                                       |
| GraphQL                                                                     | Not enabled                                                |
| Exchange its refresh token for a web session, or at another client          | 400                                                        |
| Use a web session's refresh token as a client                               | 400                                                        |

Every future grant to `authenticated` would also apply to connected clients.

## Client compatibility

| Requirement                                                                    | Result                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic registration as a public client, with Claude's and ChatGPT's callbacks | Works (VERIFIED)                                                                                                                                                                                                                  |
| `client_secret_post` and `client_secret_basic`                                 | Work (VERIFIED). `private_key_jwt` is refused                                                                                                                                                                                     |
| S256 PKCE                                                                      | Required; a wrong verifier and a replayed code fail (VERIFIED). `plain` is also accepted                                                                                                                                          |
| Client ID metadata documents                                                   | Not supported: `invalid client_id format` (VERIFIED). Both products fall back to dynamic registration, according to their documentation                                                                                           |
| `resource` parameter                                                           | Accepted and ignored. Audience stays `authenticated` and the hook input does not contain it (VERIFIED)                                                                                                                            |
| Audience through the hook                                                      | Works, and survives refresh (VERIFIED). It is one fixed value for every client, which is enough for one MCP resource                                                                                                              |
| Custom scopes                                                                  | Refused: `unsupported scope` (VERIFIED). `email`, `openid` and `offline_access` work                                                                                                                                              |
| Issuer in the authorization response (RFC 9207)                                | Absent (VERIFIED). ChatGPT then uses a callback that is specific to the connection (its documentation)                                                                                                                            |
| Discovery for an issuer with a path                                            | The third location in the MCP order works locally; the path-inserted locations return 404 locally (VERIFIED). The hosted gateway routes the first location to Auth, so it should answer there (INFERRED)                          |
| Callback matching                                                              | Exact. A loopback callback on another port is refused (VERIFIED), so a Claude Code client that changes port must register again                                                                                                   |
| Invalid refresh token                                                          | Returns `refresh_token_not_found`, without the `invalid_grant` code that Claude's documentation requires (VERIFIED). Effect on Claude is UNVERIFIED                                                                               |
| Registration limit                                                             | 30 registrations in a burst for each IP address, then 429 (VERIFIED in an extra Auth container with the rate-limit header set). The refill rate was not measured. Claude registers on every new connection, from shared addresses |
| Revocation                                                                     | A revoked grant immediately fails at `/user` and at refresh (VERIFIED). A signature-only check would accept the token until it expires                                                                                            |
| Sign-out                                                                       | Web local sign-out, which the product uses, leaves the client connected (VERIFIED). Global sign-out disconnects it                                                                                                                |

## Consent risk

VERIFIED: registration accepts any client name. A client called "Claude" with a callback on another domain registered normally. VERIFIED mitigation: a hook variant refused a lookalike domain, a client with mixed callbacks, and any host account, also at refresh after a guest became a host. Web sign-in continued to work. The consent page must also show the callback domain. The hook runs for every sign-in, so an error in it would stop web sign-in too; it needs its own tests and a rollback step.

INFERRED: the site's `form-action 'self'` policy blocks a native consent form that ends in a redirect to the assistant, so the consent page should navigate after a server action.

## Not proved

- Real ChatGPT and Claude connections, which need a public HTTPS endpoint.
- Hosted behavior of the hook's access to `auth.oauth_clients` and of the registration limit.
- Server actions with a client token. They use the same helper, but the spike requested pages and the sign-out route only.
- Performance of `/user` on every MCP request.

## Evidence

The probes and prototype are on local branch `spike/external-agent-oauth` in `spikes/external-agent-oauth/` and `src/lib/auth/session-user.ts`. They are not for merge: Phase 2 should implement the rejection test-first. Client rules come from the [Claude](https://claude.com/docs/connectors/building/authentication.md), [OpenAI](https://developers.openai.com/plugins/build/auth) and [MCP](https://modelcontextprotocol.io/specification/latest/basic/authorization) documents and the [Supabase OAuth server guide](https://supabase.com/docs/guides/auth/oauth-server/getting-started), read by a delegated research pass on 2026-11-25.
