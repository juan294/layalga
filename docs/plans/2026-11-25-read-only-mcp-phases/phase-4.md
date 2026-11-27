# Phase 4: acceptance, documents and activation runbook

Part of the [read-only MCP plan](../2026-11-25-read-only-mcp.md).

## Result

The complete journey is proved locally, the documents match it, and an operator can activate, check, stop and roll back each hosted step. No hosted action belongs to this phase.

## Entry

Phases 1 to 3 accepted.

## Unit A: complete journey [batch-eligible]

File: `tests/e2e/assistant-access.spec.ts`. Fixture household with a published listing, a synthetic Google-linked guest, and a client created through the local admin API as `manual`, public, with callback `https://claude.ai/api/mcp/auth_callback`; Playwright intercepts that origin.

1. `POST /api/mcp` gives 401; the official client follows metadata to the local Auth server.
2. Consent in the browser after sign-in, then code exchange with PKCE.
3. The three tools return the fixture household, options and the guest's request.
4. Web sign-out; tools still work.
5. Sign in, disconnect; the next call is 401 and refresh fails.
6. Reconnect; set `enabled = false` in the row; the next call is 401, refresh is refused, consent explains it.
7. Bind the guest to a fixture host; the next call is 401, consent refuses.
8. Dynamic registration is refused with 403.
9. Vendor stop: after deletion of the client's rows in `auth.sessions`, its live token gets an error from `/user` and `/oauth/userinfo`, and the guest's web session still works.

The spec removes the client, rows, household and accounts, and asserts that they are gone. Also prove that the AgentCore bundle does not contain `src/mcp` or `assistant-bearer`.

## Unit B: documents [batch-eligible]

| File | Change |
| --- | --- |
| `docs/architecture/guest-booking-channels.md` | Remote assistant channel: operations, limits, identity. Replace the "future" paragraph |
| `docs/security/data-lifecycle.md` | Assistant disclosure boundary, `assistant_clients`, request windows (two days), grants held by Auth, the `/user` limit |
| `docs/release/runtime-database-and-identity.md` | `supabase_auth_admin` grants; web role cannot write the allowlist |
| `docs/release/assistant-access-activation.md` | The runbook below, with exact commands and no secret values |
| `docs/guides/` | Guest manual: connect, what is shared, disconnect |
| `messages/*.json`, privacy page | Section `connectedAssistants` and a new date, shown only with `ASSISTANT_ACCESS=on`, because it does not apply before |
| `docs/README.md`, `docs/plans/README.md`, `docs/roadmap.md`, `CHANGELOG.md`, `.env.example` | Index, status, Unreleased entry, `ASSISTANT_ACCESS=none` |

## Unit C: activation runbook

Each gate needs its own owner authorization that names it. Stop at the first failed proof and run the rollback of that gate. Setting names are VERIFIED in the public Management API schema (`PATCH /v1/projects/{ref}/config/auth`). Send only the named fields. Never run `supabase config push`.

| Gate | Action | Proof | Rollback |
| --- | --- | --- | --- |
| G0 Preconditions | Read only: production commit contains the `getSessionUser` rejection (v2.5.3 or later); Auth config baseline saved without secrets; `oauth_server_enabled` and `hook_custom_access_token_enabled` are false; site URL is the production origin; signing keys are ES256; no Supabase GitHub integration applies `config.toml`; `authenticated` has no public privileges; hosted Auth reports v2.198.0 or later (`GET /auth/v1/health`), because earlier versions let a client token change the password, end every session and manage grants. Read the version again before G3 | Saved report | None |
| G1 Dark release | Normal release with the migration, `ASSISTANT_ACCESS` unset | Release gate; `/api/mcp` and metadata 404; SQL dry run of the hook with one web and one unknown-client event returns unchanged and 403; `assistant_clients` empty; and, because the dry run uses another role, read back for `supabase_auth_admin`: `has_schema_privilege` (`private`, `public`), `has_function_privilege` (the hook), `has_table_privilege` (`assistant_clients`), `has_column_privilege` (`hosts.auth_user_id`, `host_identity_claims.normalized_email`), the three policies and RLS state | Normal release rollback. The migration can stay |
| G2 Hook on | `hook_custom_access_token_enabled: true`, `hook_custom_access_token_uri: pg-functions://postgres/private/access_token_hook`. Owner present, rollback command ready in a second terminal | Within five minutes: owner signs in with Google in a new private window; an existing session refreshes; a guest account signs in; Auth logs show no hook error. Watch for 70 minutes, past one token lifetime | `hook_custom_access_token_enabled: false`. Takes one call |
| G3 OAuth server on | `oauth_server_enabled: true`, `oauth_server_allow_dynamic_registration: false`, `oauth_server_authorization_path: /oauth/consent` | Server metadata answers at the first discovery location; registration returns 403; web sign-in still works; consent still says switched off | `oauth_server_enabled: false` |
| G4 Claude client | Create one public `manual` client with the exact Claude callback; insert its row with `enabled = false` | Row read back equals the registered callback; still disabled | Delete the row and the client |
| G5 Endpoint on | `ASSISTANT_ACCESS=on` in Vercel production and an authorized redeploy | 401 challenge, both metadata URLs, health ready; consent refuses the disabled Claude client; a temporary client with another callback is refused and then deleted | Set `none` and redeploy |
| G6 Claude pilot | Set the row `enabled = true`. Synthetic published household and a dedicated Google account that is no host; add the custom connector with the client ID | P6 first: another assistant account's consent link is rejected by the vendor; P1 connect; P2 Origin and protocol version seen; P3 revoke and expired refresh behavior; P4 50 calls, p50 and p95 of `/user`; three tools; disconnect; tool data inspected field by field | `enabled = false` (immediate), then G5 rollback; delete the synthetic household |
| G7 ChatGPT | Separate decision. P5: entered client ID and per-connection callback | One exact row for the connection | Delete the row and client |

G3 must never precede G2: without the hook, client tokens carry `aud = authenticated`. They would still fail at the web session check and at `/api/mcp`, but the audience condition would not hold.

### Kill switch

| Need | Action, in this order | Effect |
| --- | --- | --- |
| Stop one or all assistants now | `update public.assistant_clients set enabled = false` (administrative connection) | Next call 401, refresh refused, consent explains. Grants stay, so it is reversible. A live access token can still read the guest's identity at Auth until it expires, at most one hour |
| Stop a compromised vendor, including identity reads | Disable its rows; delete its client through the admin API; `delete from auth.sessions where oauth_client_id = '<client id>'` (administrative connection) | Its tokens fail at `/user`, `/oauth/userinfo`, refresh and `/api/mcp`. Not reversible: guests connect again. Web sessions have no client ID and stay. Proved by journey step 9 |
| Remove the endpoint | After the rows are disabled: `ASSISTANT_ACCESS=none`, redeploy | 404. The assistants page still disconnects; consent links to it |
| Stop authorization | `oauth_server_enabled: false` | No new codes or refresh. Existing access tokens pass `/user` until they expire, at most one hour (SOURCE), but the rows above already stop them. Disconnect is unavailable meanwhile |
| Remove the hook | Only after the OAuth server is off: `hook_custom_access_token_enabled: false` | Web sign-in no longer depends on the hook |
| Web sign-in fails after G2 | `hook_custom_access_token_enabled: false` first, then `oauth_server_enabled: false`. This is the one exception to the order | Restores sign-in; `getSessionUser` and the audience check still refuse client tokens |
| Drop the function | Only when the hook is disabled and read back as disabled | Dropping it earlier stops all sign-in |

Rollback of the web app alone: a version before this release has no `/api/mcp`, which is safe. Do not roll back below v2.5.3 while the OAuth server is on, because condition 1 would be lost; turn the server off first.

## Automated acceptance

- The full sequence in the plan passes on the final candidate.
- Every link in changed documents resolves; `messages/en.json` and `messages/es.json` have the same keys.
- A test reads the runbook's setting names, hook URI and callback and compares them with the code constants.

## Manual acceptance

- Owner reads the privacy section in both languages and the runbook.
- Owner decides separately on release, G1 to G7, and the push scan with Strix before any integration push.
