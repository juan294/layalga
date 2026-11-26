# Assistant access: activation runbook

This runbook switches on read-only assistant access in production, one gate at a time, and stops or rolls it back. It is prepared and not run. Plan: `2026-11-25-read-only-mcp.md`, Phase 4 (`2026-11-25-read-only-mcp-phases/phase-4.md`). Code state: the release that contains `supabase/migrations/20261125000100_assistant_access.sql`, `/api/mcp` and the consent page, with `ASSISTANT_ACCESS` unset (`none`).

## Rules

- Each gate needs its own owner authorization that names the gate. An approval of one gate does not cover the next.
- Stop at the first failed proof and run the rollback of that gate. Record the result in the release notes.
- G3 never comes before G2. Without the hook, client tokens carry `aud = authenticated`. They still fail at the web session check and at `/api/mcp`, but the audience condition does not hold.
- Change Auth settings only with `PATCH /v1/projects/{ref}/config/auth` and only the fields that this runbook names. The names are VERIFIED in the public Management API schema (`UpdateAuthConfigBody`, read on 2026-11-26). A test compares them with `supabase/config.toml` and the migration (`src/core/assistant-access/activation-runbook.test.ts`).
- Never run `supabase config push`. `supabase/config.toml` describes local stacks only (`src/core/assistant-access/config-push.test.ts`).
- Never print, paste or commit a key, token or authorization URL. The commands below keep secrets in shell variables and send them to `curl` on a file descriptor, so they are not in the process list or the shell history.

## Session setup

Run these in a `bash` shell (the commands use bash syntax; zsh reads `read -p` differently) in the terminal that will run the gate. The personal access token comes from the owner's Supabase account and is read without echo.

```bash
export PROJECT_REF=hyyrnpyidipkuhakeiyb
export APP=https://layalga.thecreativetoken.com
export AUTH_URL="https://${PROJECT_REF}.supabase.co/auth/v1"
read -rs SUPABASE_ACCESS_TOKEN && export SUPABASE_ACCESS_TOKEN
mgmt() { curl -sS --fail-with-body -H @<(printf 'Authorization: Bearer %s\n' "$SUPABASE_ACCESS_TOKEN") "$@"; }
auth_config() { mgmt "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" "$@"; }
patch_auth() { auth_config -X PATCH -H 'content-type: application/json' --data @-; }
assistant_settings() { auth_config | jq '{site_url, jwt_exp, oauth_server_enabled, oauth_server_allow_dynamic_registration, oauth_server_authorization_path, hook_custom_access_token_enabled, hook_custom_access_token_uri}'; }
export SUPABASE_PUBLISHABLE_KEY="$(mgmt "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys" | jq -r 'map(select(.type == "publishable"))[0].api_key')"
```

SQL runs through the linked project with `supabase db query --remote`. Reads use `--read-only`; a write asks for confirmation on a hosted database. The SQL files below are in this document; copy each into a file outside the repository before you run it.

## G0: preconditions (read only)

Action: none. Save the report outside the repository.

1. Production contains the `getSessionUser` rejection of client tokens (v2.5.3 or later). In a checkout with the release tags:

   ```bash
   deployed="$(curl -sS "$APP/api/health" | jq -r .commit)"
   git merge-base --is-ancestor "$(git rev-parse 'v2.5.3^{commit}')" "$deployed" && echo "contains v2.5.3"
   ```

2. Auth baseline, without secrets. It must show `oauth_server_enabled: false`, `hook_custom_access_token_enabled: false` and `site_url` equal to `https://layalga.thecreativetoken.com`:

   ```bash
   assistant_settings | tee "$HOME/layalga-auth-baseline-$(date -u +%Y%m%dT%H%M%SZ).json"
   ```

3. Signing keys are ES256. Every key `in_use` must have `algorithm: ES256`:

   ```bash
   mgmt "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth/signing-keys" | jq '.keys | map({algorithm, status})'
   ```

4. Hosted Auth is v2.198.0 or later. Earlier versions let a client token change the password, end every session of the user and manage grants (notes file, acceptance item A1). Read the version again before G3:

   ```bash
   curl -sS -H @<(printf 'apikey: %s\n' "$SUPABASE_PUBLISHABLE_KEY") "$AUTH_URL/health" | jq -r .version
   ```

5. No Supabase GitHub integration applies `config.toml`. The newest `main` commit must have no check run from a Supabase app, and the dashboard (Project Settings, Integrations) must show no connected repository:

   ```bash
   gh api "repos/juan294/layalga/commits/main/check-runs" --jq '[.check_runs[].app.slug] | unique'
   ```

6. `authenticated` has no grants on public tables and can execute no public function. Both counts must be 0:

   ```sql
   select
     (select count(*) from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public') as table_grants,
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) as executable_functions;
   ```

   ```bash
   supabase db query --remote --read-only --file g0-authenticated.sql
   ```

7. The OAuth server is off: the first discovery location answers `feature_disabled`.

   ```bash
   curl -sS "https://${PROJECT_REF}.supabase.co/.well-known/oauth-authorization-server/auth/v1"
   ```

Rollback: none.

## G1: dark release

Action: a normal release that applies the migration (`supabase db push --linked`, see `e2e-pro-playbook.md`), with `ASSISTANT_ACCESS` unset in Vercel.

Proof:

1. The release gate passes.
2. `/api/mcp` and both metadata URLs answer 404:

   ```bash
   for path in /api/mcp /.well-known/oauth-protected-resource /.well-known/oauth-protected-resource/api/mcp; do
     printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$APP$path")" "$path"
   done
   ```

3. Dry run of the hook: a web event returns unchanged (`web_unchanged: true`) and an unknown client gets `403`. The events are synthetic; the statement reads no row and runs read-only.

   ```sql
   select
     private.access_token_hook(web.event) = web.event as web_unchanged,
     private.access_token_hook(client.event) -> 'error' ->> 'http_code' as unknown_client
   from
     (select '{"user_id":"00000000-0000-4000-8000-00000000d001","authentication_method":"oauth","claims":{"aud":"authenticated","sub":"00000000-0000-4000-8000-00000000d001","role":"authenticated","email":"dry-run@example.invalid"}}'::jsonb as event) web,
     (select '{"user_id":"00000000-0000-4000-8000-00000000d001","authentication_method":"oauth_provider/authorization_code","claims":{"aud":"authenticated","sub":"00000000-0000-4000-8000-00000000d001","role":"authenticated","email":"dry-run@example.invalid","client_id":"00000000-0000-4000-8000-00000000d0ff"}}'::jsonb as event) client;
   ```

   ```bash
   supabase db query --remote --read-only --file g1-dry-run.sql
   ```

4. The dry run uses another role, so read back what Auth itself holds. Every privilege must be `true`, `auth_policies` 3, `rls_on` true, `web_writes_allowlist` false and `allowlist_rows` 0:

   ```sql
   select
     has_schema_privilege('supabase_auth_admin', 'private', 'usage') as private_usage,
     has_schema_privilege('supabase_auth_admin', 'public', 'usage') as public_usage,
     has_function_privilege('supabase_auth_admin', 'private.access_token_hook(jsonb)', 'execute') as hook_execute,
     has_table_privilege('supabase_auth_admin', 'public.assistant_clients', 'select') as clients_select,
     has_column_privilege('supabase_auth_admin', 'public.hosts', 'auth_user_id', 'select') as hosts_auth_user_id,
     has_column_privilege('supabase_auth_admin', 'public.host_identity_claims', 'normalized_email', 'select') as claims_email,
     (select count(*) from pg_policies
       where policyname in ('auth_hook_assistant_clients', 'auth_hook_host_identity_claims', 'auth_hook_hosts')
         and 'supabase_auth_admin' = any (roles)) as auth_policies,
     (select bool_and(relrowsecurity) from pg_class
       where oid in ('public.assistant_clients'::regclass, 'public.hosts'::regclass, 'public.host_identity_claims'::regclass)) as rls_on,
     has_table_privilege('layalga_web_runtime', 'public.assistant_clients', 'insert, update, delete') as web_writes_allowlist,
     (select count(*) from public.assistant_clients) as allowlist_rows;
   ```

   ```bash
   supabase db query --remote --read-only --file g1-privileges.sql
   ```

Rollback: the normal release rollback (`e2e-pro-playbook.md`). The migration can stay: nothing calls the hook until G2.

## G2: hook on

Action: with the owner present and the rollback command ready in a second terminal (same session setup):

```bash
patch_auth <<'JSON'
{
  "hook_custom_access_token_enabled": true,
  "hook_custom_access_token_uri": "pg-functions://postgres/private/access_token_hook"
}
JSON
assistant_settings
```

Proof, within five minutes: the owner signs in with Google in a new private window; an existing session refreshes; a guest account signs in; the Auth logs show no hook error. Then watch for 70 minutes, past one token lifetime (`jwt_exp` 3600).

Rollback, one call:

```bash
patch_auth <<'JSON'
{
  "hook_custom_access_token_enabled": false
}
JSON
```

## G3: OAuth server on

Action: read the Auth version again (G0 step 4), then:

```bash
patch_auth <<'JSON'
{
  "oauth_server_enabled": true,
  "oauth_server_allow_dynamic_registration": false,
  "oauth_server_authorization_path": "/oauth/consent"
}
JSON
assistant_settings
```

Proof:

1. Server metadata answers at the first discovery location (the command in G0 step 7 now returns JSON with `issuer` equal to `$AUTH_URL`).
2. Registration is refused with 403 `oauth_dynamic_client_registration_disabled`:

   ```bash
   curl -sS -X POST -H @<(printf 'apikey: %s\n' "$SUPABASE_PUBLISHABLE_KEY") -H 'content-type: application/json' \
     --data '{"client_name":"Registration check","redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}' \
     "$AUTH_URL/oauth/clients/register"
   ```

3. Web sign-in still works.
4. `$APP/en/oauth/consent?authorization_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` says that assistant connections are switched off.

Rollback:

```bash
patch_auth <<'JSON'
{
  "oauth_server_enabled": false
}
JSON
```

## G4: Claude client

Action: create one public, manual client with the exact Claude callback through the Auth admin API, then its allowlist row, disabled. The secret key stays in a shell variable and is removed at the end.

```bash
SB_SECRET="$(mgmt "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true" | jq -r 'map(select(.type == "secret"))[0].api_key')"
auth_admin() { curl -sS --fail-with-body -H @<(printf 'apikey: %s\nAuthorization: Bearer %s\n' "$SB_SECRET" "$SB_SECRET") "$@"; }
CLAUDE_CLIENT_ID="$(auth_admin -X POST -H 'content-type: application/json' "$AUTH_URL/admin/oauth/clients" --data @- <<'JSON' | jq -r .client_id
{
  "client_name": "Claude",
  "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
  "client_type": "public",
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"]
}
JSON
)"
unset SB_SECRET
echo "$CLAUDE_CLIENT_ID"
supabase db query --remote "insert into public.assistant_clients (client_id, assistant, redirect_uri, enabled) values ('$CLAUDE_CLIENT_ID', 'claude', 'https://claude.ai/api/mcp/auth_callback', false)"
```

The client ID is not secret; record it in the release notes, because Claude's connector dialog needs it at G6.

Proof: the row equals the registered client and is still disabled. Expect one row with `enabled` false, `callback_matches` true, `client_type` `public`, `registration_type` `manual`, `token_endpoint_auth_method` `none` and `registered` true:

```sql
select allowed.client_id, allowed.assistant, allowed.enabled,
  allowed.redirect_uri = registered.redirect_uris as callback_matches,
  registered.client_type, registered.registration_type, registered.token_endpoint_auth_method,
  registered.deleted_at is null as registered
from public.assistant_clients allowed
join auth.oauth_clients registered on registered.id = allowed.client_id;
```

```bash
supabase db query --remote --read-only --file g4-readback.sql
```

Rollback: delete the row, then the client (the admin API sets `deleted_at`; the hook and the resolver refuse a deleted client).

```bash
supabase db query --remote "delete from public.assistant_clients where client_id = '$CLAUDE_CLIENT_ID'"
SB_SECRET="$(mgmt "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true" | jq -r 'map(select(.type == "secret"))[0].api_key')"
auth_admin -X DELETE "$AUTH_URL/admin/oauth/clients/$CLAUDE_CLIENT_ID"
unset SB_SECRET
```

## G5: endpoint on

Action: set the switch in Vercel production, then an authorized redeploy of the current production deployment. `vercel env add` asks for the value; enter `on`.

```bash
vercel env add ASSISTANT_ACCESS production
vercel inspect layalga.thecreativetoken.com --scope thecreativetoken
read -r -p 'Deployment URL from the inspect output: ' current
vercel redeploy "$current" --target production --scope thecreativetoken
```

The inspect output format was not read for this runbook (no hosted read); check that `current` names the deployment of the release commit that `/api/health` reports before you redeploy.

Proof:

1. `POST $APP/api/mcp` without a token answers 401 with `WWW-Authenticate: Bearer resource_metadata="https://layalga.thecreativetoken.com/.well-known/oauth-protected-resource/api/mcp", scope="openid"`.
2. Both metadata URLs answer JSON with `resource` `https://layalga.thecreativetoken.com/api/mcp` and one authorization server, `$AUTH_URL`.
3. `curl -sS "$APP/api/health" | jq .status` is `"ok"`. A `degraded` answer with key `APP_URL` means that `APP_URL` does not match the token audience.
4. Consent refuses the disabled Claude client: start a connection from Claude and read the consent page text ("This assistant cannot connect").
5. A temporary client with another callback is refused at consent, then deleted. Create it as in G4 with `"client_name": "Callback check"` and `"redirect_uris": ["https://claude.ai/api/mcp/other_callback"]`, insert no allowlist row, open `$AUTH_URL/oauth/authorize` for it in a browser (see the authorization request in `src/test-support/assistant-oauth.ts`), read the refusal, and delete it with the G4 rollback commands.
6. `$APP/en/privacy` shows the section "Connected assistants" with the new date.

Rollback: set `none` and redeploy.

```bash
vercel env rm ASSISTANT_ACCESS production
vercel env add ASSISTANT_ACCESS production   # value: none
vercel redeploy "$current" --target production --scope thecreativetoken
```

## G6: Claude pilot

Action: enable the row, then use a synthetic published household and a dedicated Google account that is no host and has no prepared host email. In Claude, add a custom connector with URL `https://layalga.thecreativetoken.com/api/mcp` and the client ID from G4.

```bash
supabase db query --remote "update public.assistant_clients set enabled = true where client_id = '$CLAUDE_CLIENT_ID'"
```

Proof, in this order. P6 first: a failure stops the pilot.

| Check                | What to record                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P6 connection mix-up | Open the consent link of another Claude account's connection attempt in the pilot account's browser and finish it. Claude must reject the return.                                                                                                                                                                                                                                 |
| P1 connect           | The connector connects with the registered client ID and no secret.                                                                                                                                                                                                                                                                                                               |
| P2 headers           | Whether Claude's calls pass the Origin check. `[MCP_REQUEST]` log lines in Vercel show `outcome: "origin"` for a refused Origin; a successful call means the header was absent, `https://claude.ai` or our own origin. The log does not record the exact Origin value or the protocol version (`src/mcp/server.ts`), so these two values are not observable without a log change. |
| P3 recovery          | Disconnect on `$APP/en/assistants`, wait past the token lifetime, and record what Claude shows. Auth answers `refresh_token_not_found` without `invalid_grant`. The official MCP client 2.3.1 falls back to a new authorization (VERIFIED in the local journey test, `tests/e2e/assistant-access.spec.ts`); Claude's reaction is UNVERIFIED.                                      |
| P4 latency           | 50 tool calls: p50 and p95 of the `ms` field of `[MCP_REQUEST]`. It is the whole request, including the `/user` check; it does not separate `/user`.                                                                                                                                                                                                                              |
| Tools                | `find_households`, `search_stays` and `read_request_status` answer for the synthetic household. Inspect each answer field by field: only household name, page link, dates, room terms and request status.                                                                                                                                                                         |
| Disconnect           | The connection is listed on `$APP/en/assistants` and disconnects; the next call fails.                                                                                                                                                                                                                                                                                            |

Rollback: `enabled = false` (immediate), then the G5 rollback; delete the synthetic household.

```bash
supabase db query --remote "update public.assistant_clients set enabled = false where client_id = '$CLAUDE_CLIENT_ID'"
```

## G7: ChatGPT

A separate owner decision. P5: ChatGPT must accept an entered client ID, and it uses a callback for each connection, because Auth sends no `iss` in the authorization response. Each connection then needs one exact row, created as in G4 with ChatGPT's callback and `'chatgpt'` in the `assistant` column. If ChatGPT cannot take a predefined client ID, ChatGPT waits for directory publication.

Rollback: delete the row and the client (G4 rollback with the ChatGPT client ID).

## Kill switch

Run the steps of a row in the order shown. SQL runs with `supabase db query --remote`.

| Need                                                | Action                                                                                                                                       | Effect                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop one or all assistants now                      | `update public.assistant_clients set enabled = false` (add `where client_id = '…'` for one)                                                  | The next call is 401, refresh is refused and consent explains why. Grants stay, so it is reversible: enabling the row makes the same tokens work again (VERIFIED locally, journey step 7). A live access token can still read the guest's identity at Auth until it expires, at most one hour. |
| Stop a compromised vendor, including identity reads | Disable its rows; delete its client with the admin API (G4 rollback); then `delete from auth.sessions where oauth_client_id = '<client id>'` | Its tokens fail at `/user`, `/oauth/userinfo`, refresh and `/api/mcp`. Not reversible: guests connect again. Web sessions have no client ID and stay (VERIFIED locally, journey step 9).                                                                                                       |
| Remove the endpoint                                 | After the rows are disabled: `ASSISTANT_ACCESS=none` and a redeploy (G5 rollback)                                                            | 404. The assistants page still disconnects; consent links to it.                                                                                                                                                                                                                               |
| Stop authorization                                  | `"oauth_server_enabled": false` (G3 rollback)                                                                                                | No new codes or refresh. Existing access tokens pass `/user` until they expire, at most one hour, but the disabled rows already stop them at `/api/mcp`. Disconnect is unavailable meanwhile.                                                                                                  |
| Remove the hook                                     | Only after the OAuth server is off: `"hook_custom_access_token_enabled": false` (G2 rollback)                                                | Web sign-in no longer depends on the hook.                                                                                                                                                                                                                                                     |
| Web sign-in fails after G2                          | `"hook_custom_access_token_enabled": false` first, then `"oauth_server_enabled": false`. This is the one exception to the order.             | Sign-in works again; `getSessionUser` and the audience check still refuse client tokens.                                                                                                                                                                                                       |
| Drop the function                                   | Only when the hook is disabled and `assistant_settings` reads it back as disabled                                                            | Dropping it earlier stops all sign-in.                                                                                                                                                                                                                                                         |

Rollback of the web app alone: a version before this release has no `/api/mcp`, which is safe. Do not roll back below v2.5.3 while the OAuth server is on, because the web rejection of client tokens would be lost; turn the server off first.

## Evidence that this runbook matches the code

- The setting names, the hook URI, the consent path, the callback and the audience are compared with `supabase/config.toml`, the migration and the code constants by `src/core/assistant-access/activation-runbook.test.ts`.
- The SQL statements of G0, G1 and G4 ran on a disposable local stack (CLI 3.3.0, Auth v2.198.0) on 2026-11-26 with the expected results: `web_unchanged` true and `unknown_client` 403; every privilege true, 3 policies, RLS on, no web write, 0 rows; 0 table grants and 0 executable functions.
- The admin API calls of G4, the registration refusal of G3 and journey steps 1 to 9 ran against the same local stack in `tests/e2e/assistant-access.spec.ts`.
- No command in this runbook was run against the hosted project.
