# Runtime database and host identity

The application must not use the Supabase `postgres` owner credential outside the local stack. Migration `20260831001100_secure_invitation_identity.sql` creates two login roles with no password and two NOLOGIN grant roles:

| External service                   | Login role      | Grant role              |
| ---------------------------------- | --------------- | ----------------------- |
| Vercel web and local agent runtime | `layalga_web`   | `layalga_web_runtime`   |
| AgentCore runtime                  | `layalga_agent` | `layalga_agent_runtime` |

The roles cannot create roles or databases, bypass RLS, replicate, use the `auth` schema, create objects in `public`, or run the retention function. The web role can read prepared host mappings and update only their `auth_user_id` and `claimed_at` claim-state columns. It cannot insert or delete mappings or update their email, host, or home columns. The web role can insert and delete host rows for the synthetic demo reset, but it can update only `hosts.auth_user_id`; the application claim transaction still verifies the immutable email-to-host mapping, and unique constraints reject duplicate user claims. The agent role has read-only host access. `src/core/db/client.ts` rejects a remote `postgres` or `postgres.<project-ref>` URL before opening a connection.

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

Run this only through the administrative connection. The web role can read and claim a prepared mapping, but it cannot insert, delete, or redirect one. Existing claimed users are backfilled from `auth.users`; the fixed synthetic identities map to their existing demo host UUIDs. Duplicate user claims, conflicting emails, and missing mappings fail closed.

The fixed Nel owner identity is also part of the migration and demo-reset data. This keeps the real Google host binding available after `POST /api/demo/reset` or `pnpm run seed:demo`; a reset must not reduce the house to synthetic-only access.

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

The statement must return exactly one row. The next cron invocation can claim the job. Notification idempotency prevents a successful earlier delivery from being sent again.
