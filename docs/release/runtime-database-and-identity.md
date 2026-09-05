# Runtime database and host identity

The application must not use the Supabase `postgres` owner credential outside the local stack. Migration `20260831001100_secure_invitation_identity.sql` creates two login roles with no password and two NOLOGIN grant roles:

| External service                   | Login role      | Grant role              |
| ---------------------------------- | --------------- | ----------------------- |
| Vercel web and local agent runtime | `layalga_web`   | `layalga_web_runtime`   |
| AgentCore runtime                  | `layalga_agent` | `layalga_agent_runtime` |

The roles cannot create roles or databases, bypass RLS, replicate, use the `auth` schema, create objects in `public`, or run the retention function. The web role can read prepared host mappings and update only their `auth_user_id` and `claimed_at` claim-state columns. It cannot insert or delete mappings or update their email, host, or home columns. The web role can insert and delete host rows for the synthetic demo reset, but it can update only `hosts.auth_user_id`; the application claim transaction still verifies the immutable email-to-host mapping, and unique constraints reject duplicate user claims. The agent role has read-only host access. `src/core/db/client.ts` rejects a remote `postgres` or `postgres.<project-ref>` URL before opening a connection.

Migration `20260831083526_agent_first_room_coordination.sql` narrows `layalga_agent_runtime`'s room access further: `select` on a restricted column subset of `rooms` (no `private_notes`), `select` and `delete` plus column-scoped `insert` on `visit_rooms`, and `select` and `insert` on `room_action_proposal_rooms`. It grants no access to `private_room_blocks` or write access to `room_availability_overrides` — those stay host-only through `layalga_web`. The agent can only ever create a pending room-action proposal; applying one still runs through a host-authenticated web action.

The September 5 completion migrations `20260905000100` through `20260905000700` are verified locally and must accompany the matching code in a separately authorized production release. They extend invitation access for finite booked stays, support cancellation, add `visits.guest_notes`, version the existing household policy, and add guest contacts/outbox/attempt receipts and recovery indexes. Notes use the existing visits grants and trusted booking-state path; they are not model-prompt input. Only `layalga_web_runtime` can update the policy columns. The agent reads current policy and cannot mutate it. Guest contact/delivery tables explicitly deny agent, public, anon, authenticated and service-role privileges and enable RLS; the web runtime alone receives their required DML. The retention function remains maintenance-only.

## AgentCore runtime identity

Since [ADR 0002](../decisions/0002-agent-runtime.md)'s production runtime addendum, the AgentCore runtime `arn:aws:bedrock-agentcore:us-east-1:106403001709:runtime/layalga_agent-mONXXjFms4` is the production agent execution path. Its `DATABASE_URL` (set in `.env.agentcore` and read by `scripts/deploy-agentcore.sh`) is the same pooled `layalga_agent` login described above, not a separate credential; the runtime never connects as the database owner and never receives the `layalga_web` URL. `AGENT_EXECUTION_RUNTIME=agentcore` in that same env selects the agent-process environment profile, which validates only the database URL, the application URL, the link token secret, and the model settings, and does not read or need the web-only secrets (Supabase publishable keys, cron secret, calendar feed secret).

The AgentCore `DATABASE_URL` uses the Supabase pooler's **transaction-mode** port (`6543`), not the session-mode port (`5432`) the web runtime's `DATABASE_URL` stays on. Each AgentCore microVM holds its own connection pool (`postgres.js`'s default), so a fleet of concurrently invoked runtimes can hold far more open sessions than the session-mode pooler's 15-client cap on the `layalga_agent` login allows; transaction mode multiplexes many short-lived borrows over a small number of real backend connections instead. The web runtime's traffic pattern does not have this problem (Vercel functions borrow briefly per request and Next.js already pools within a region), so its `DATABASE_URL` is unchanged.

IAM documents govern what each identity can call outside the database:

| Document                                                                                | Grants to                                                      | Covers                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `infra/iam/web-bedrock-policy.json`                                                     | `layalga-web` (IAM user)                                       | `bedrock:InvokeModel` on the checked-in model inference-profile and foundation-model allowlist (review against the configured model before release), `bedrock-agentcore:InvokeAgentRuntime` on `layalga_agent-*` runtimes, and an explicit deny on `GetWorkloadAccessTokenForUserId` |
| `infra/iam/agentcore-runtime-trust.json` / `infra/iam/agentcore-runtime-execution.json` | `layalga-agentcore-runtime` (IAM role, assumed by the runtime) | The runtime's own Bedrock model invocation, X-Ray, and CloudWatch metrics permissions                                                                                                                                                                                                |
| `infra/iam/web-ses-policy.json`                                                         | `layalga-web`                                                  | `ses:SendEmail`/`ses:SendRawEmail` on the `thecreativetoken.com` identity, conditioned on `ses:FromAddress = noreply@layalga.thecreativetoken.com` and `ses:Recipients` pinned to the two host addresses                                                                             |
| `infra/iam/memory-data-plane.json`                                                      | `layalga-web` and inline on `layalga-agentcore-runtime`        | Memory data-plane actions on the single household resource; includes exact-party reads for deterministic room recommendations                                                                                                                                                        |
| `infra/iam/web-ses-guest-policy.json` — prepared, not applied                           | `layalga-web` only, after separate authorization               | `ses:SendEmail` scoped to the existing verified identity and sender; application consent, verification, source and synthetic guards restrict guest eligibility                                                                                                                       |

The web IAM user can invoke the model/runtime and send host email; guest sender permission is prepared separately and remains unapplied by this implementation. It never holds an AgentCore workload identity token. The runtime role can call the model and write traces/metrics; it does not hold SES or guest-contact table rights. See [guest email readiness](guest-email-readiness.md) for activation and evidence boundaries.

**Configured-model and fallback limit:** the current example selects `us.anthropic.claude-sonnet-4-6`. The checked-in AgentCore execution policy includes both Sonnet 4.5 and 4.6, but `web-bedrock-policy.json` currently permits direct model calls only to Sonnet 4.5. Thus `AGENT_RUNTIME=local` with Sonnet 4.6 cannot be assumed to work under that web policy. Before an authorized production fallback, verify the actual web model and attached permissions; use a model already authorized for that identity or separately review/authorize the required policy change. The historical one-flag rollback recipe is conditional on compatible model permission. This document does not apply IAM changes or claim the deployed policies were freshly inspected.

## Release-time credential step

The migration deliberately sets no password. It does not change Vercel, AgentCore, or production `DATABASE_URL` values. Complete this step once, after the migration is applied and before starting the candidate runtime:

1. Connect with the separate administrative migration credential. Do not expose it to the web or agent process.
2. Use `\password layalga_web` and `\password layalga_agent` in `psql`. Enter unique generated passwords at the prompts. Do not put either password in shell history, command arguments, repository files, logs, or issue comments.
3. Build one pooled Supabase URL for each login role. Set the web URL as the Vercel `DATABASE_URL`. Set the agent URL as the AgentCore `DATABASE_URL`. Keep the administrative URL only in the migration/release secret boundary.
4. Remove the unused hosted Supabase secret key from the web runtime if no separate release operation consumes it. The application does not use that key for database access.
5. Restart or redeploy only after both runtime secret stores contain the new URLs.

The repository cannot prove that secret swap. Release evidence must show the connected role without exposing the URL:

```sql
select current_user;

select
  current_user,
  rolsuper,
  rolcreaterole,
  rolcreatedb,
  rolreplication,
  rolbypassrls
from pg_roles
where rolname = current_user;

select
  has_schema_privilege(current_user, 'auth', 'USAGE') as auth_schema_usage,
  has_schema_privilege(current_user, 'public', 'CREATE') as public_schema_create,
  has_table_privilege(current_user, 'public.invitations', 'SELECT,INSERT,UPDATE')
    as invitation_dml,
  has_column_privilege(
    current_user,
    'public.host_identity_claims',
    'auth_user_id',
    'UPDATE'
  ) as identity_claim_update,
  has_column_privilege(
    current_user,
    'public.host_identity_claims',
    'host_id',
    'UPDATE'
  ) as identity_redirect;
```

Expected: `current_user` is the service-specific login; every role capability, schema capability, and `identity_redirect` is `false`; `invitation_dml` is `true`; and `identity_claim_update` is true only for `layalga_web`. A production value starting with `postgres` is a release blocker.

## Provision one host identity

Host authorization no longer uses an email's position in a list. Insert each normalized provider email against the intended stable host ID. The database derives and verifies the home ID:

```sql
insert into public.host_identity_claims (
  normalized_email,
  host_id,
  home_id
)
select
  lower(btrim(:'host_email')),
  host.id,
  host.home_id
from public.hosts as host
where host.id = :'host_id'::uuid;
```

Run this only through the administrative connection. The web role can read and claim a prepared mapping, but it cannot insert, delete, or redirect one. Existing claimed users are backfilled from `auth.users`. Duplicate user claims, conflicting emails, and missing mappings fail closed.

Juan González and Jordan Lynn are the two stable host identities. The demo uses those same two host rows, so reminders still have exactly two recipients. The migration and every demo-reset path restore both email mappings and preserve an existing Google auth binding.

Verify the mapping without printing the email:

```sql
select
  host_id,
  home_id,
  auth_user_id is not null as claimed
from public.host_identity_claims
where normalized_email = lower(btrim(:'host_email'));
```

## Replay a quarantined scheduled job

A scheduled job waits one minute after its first failure and five minutes after its second failure. Its third failure changes its status to `quarantined` and creates a `scheduled_job_quarantined` audit event. Inspect the job and its audit event before replay. Do not change a queued or running job.

Use an operator database session to replay one verified quarantined job:

```sql
update public.scheduled_jobs
set status = 'scheduled',
    attempt_count = 0,
    available_at = now(),
    quarantined_at = null,
    claim_token = null,
    claimed_at = null,
    run_id = null,
    last_error = null
where id = :'job_id'::uuid
  and status = 'quarantined'
returning id, status, available_at;
```

The statement must return exactly one row. The next cron invocation can claim the job. Notification uniqueness prevents duplicate in-app rows. This procedure is for `scheduled_jobs`, not an instruction to replay external-email attempts.

## Inspect guest delivery without duplicating a send

The host panel reports per-visit contact/delivery state separately from reply state. `sent` means the provider accepted a send; it does not prove inbox delivery. `unknown` means a send reached authorization but no reliable provider outcome was recorded. Inspect the exact outbox source and its `guest_email_attempts` receipts through an authorized operator connection without printing contact addresses or capabilities. Never reset an authorized/unknown attempt to queued merely to clear the panel. The dispatcher recovers accepted receipts without resending and reclaims expired claims only when they never reached authorization.

Cancellation, contact changes and final send authorization share the home lock. Withdrawal suppresses future authorizations; an authorized in-flight email cannot be recalled. Before treating missing reminders as a scheduler fault, distinguish no contact, unverified consent, disabled email, invalid invitation access, not-yet-due work, provider failure and guest silence. Synthetic homes intentionally send no guest email, including verification.
