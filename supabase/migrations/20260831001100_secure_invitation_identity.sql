-- Stable invitation capabilities ------------------------------------------------

alter table public.invitations
  add column link_token text,
  add column link_token_expires_at timestamptz,
  add column link_token_revoked_at timestamptz;

-- Preserve every live legacy URL by assigning each party token to the same
-- newest non-cancelled invitation that the former lookup selected.
with legacy_link_target as (
  select distinct on (party.id)
    invitation.id as invitation_id,
    party.link_token,
    party.link_token_expires_at
  from public.parties as party
  join public.invitations as invitation
    on invitation.party_id = party.id
   and invitation.home_id = party.home_id
  where invitation.status <> 'cancelled'
  order by party.id, invitation.created_at desc, invitation.id desc
)
update public.invitations as invitation
set link_token = target.link_token,
    link_token_expires_at = target.link_token_expires_at
from legacy_link_target as target
where invitation.id = target.invitation_id;

alter table public.invitations
  alter column link_token_expires_at
    set default (now() + interval '30 days'),
  add constraint invitations_link_lifecycle_check check (
    (link_token is null and link_token_expires_at is null)
    or (link_token is not null and link_token_expires_at is not null)
  );

create unique index invitations_link_token_idx
  on public.invitations (link_token)
  where link_token is not null;

create index agent_sessions_retention_idx
  on public.agent_sessions (updated_at, session_id);

-- New invitations own their link. Keep the legacy columns nullable during the
-- rollout so an older application instance cannot block party creation.
alter table public.parties
  alter column link_token drop not null,
  alter column link_token_expires_at drop not null,
  alter column link_token_expires_at drop default;

-- Stable host identity ----------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from public.hosts
    where auth_user_id is not null
    group by auth_user_id
    having count(*) > 1
  ) then
    raise exception 'Cannot secure host identity: one auth user is assigned to multiple hosts';
  end if;
end
$$;

create unique index hosts_auth_user_id_key
  on public.hosts (auth_user_id)
  where auth_user_id is not null;

create table public.host_identity_claims (
  normalized_email text primary key,
  host_id uuid not null,
  home_id uuid not null,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  constraint host_identity_claims_normalized_email_check check (
    normalized_email = lower(btrim(normalized_email))
    and normalized_email <> ''
  ),
  constraint host_identity_claims_host_home_fk
    foreign key (host_id, home_id)
    references public.hosts (id, home_id) on delete cascade
);

insert into public.host_identity_claims (
  normalized_email,
  host_id,
  home_id,
  auth_user_id,
  claimed_at
)
select
  lower(btrim(auth_user.email)),
  host.id,
  host.home_id,
  host.auth_user_id,
  now()
from public.hosts as host
join auth.users as auth_user on auth_user.id = host.auth_user_id
where auth_user.email is not null
  and btrim(auth_user.email) <> '';

-- Fixed demo mappings preserve the documented synthetic identities without
-- relying on host row order.
insert into public.host_identity_claims (
  normalized_email,
  host_id,
  home_id
)
select
  mapping.normalized_email,
  host.id,
  host.home_id
from (
  values
    ('nel@example.com'::text, '00000000-0000-4000-8000-000000000201'::uuid),
    ('covadonga@example.com'::text, '00000000-0000-4000-8000-000000000202'::uuid)
) as mapping(normalized_email, host_id)
join public.hosts as host on host.id = mapping.host_id
on conflict (normalized_email) do nothing;

do $$
begin
  if exists (
    select 1
    from (
      values
        ('nel@example.com'::text, '00000000-0000-4000-8000-000000000201'::uuid),
        ('covadonga@example.com'::text, '00000000-0000-4000-8000-000000000202'::uuid)
    ) as mapping(normalized_email, host_id)
    join public.hosts as host on host.id = mapping.host_id
    left join public.host_identity_claims as claim
      on claim.normalized_email = mapping.normalized_email
     and claim.host_id = host.id
     and claim.home_id = host.home_id
    where claim.normalized_email is null
  ) then
    raise exception 'Cannot secure demo host identity: configured email maps to another host';
  end if;
end
$$;

alter table public.host_identity_claims enable row level security;
revoke all on table public.host_identity_claims
  from anon, authenticated, service_role;

-- Runtime database roles --------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'layalga_web_runtime') then
    create role layalga_web_runtime
      nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'layalga_agent_runtime') then
    create role layalga_agent_runtime
      nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'layalga_web') then
    create role layalga_web
      login password null inherit nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'layalga_agent') then
    create role layalga_agent
      login password null inherit nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls;
  end if;
end
$$;

grant layalga_web_runtime to layalga_web;
grant layalga_agent_runtime to layalga_agent;

grant usage on schema public to layalga_web_runtime, layalga_agent_runtime;

grant select, insert, update, delete on table
  public.homes,
  public.rooms,
  public.parties,
  public.invitations,
  public.visits,
  public.visit_rooms,
  public.agent_sessions,
  public.runs,
  public.pending_decisions,
  public.audit_events,
  public.scheduled_jobs,
  public.notifications,
  public.demo_clock,
  public.demo_mutation_limits,
  public.demo_mutation_leases
to layalga_web_runtime;

grant select, insert, delete on table public.hosts to layalga_web_runtime;
grant update (auth_user_id) on table public.hosts to layalga_web_runtime;
grant select on table public.host_identity_claims to layalga_web_runtime;
grant update (auth_user_id, claimed_at) on table public.host_identity_claims
to layalga_web_runtime;

grant select on table
  public.homes,
  public.rooms,
  public.hosts,
  public.demo_clock
to layalga_agent_runtime;

grant select, insert, update, delete on table
  public.parties,
  public.invitations,
  public.visits,
  public.visit_rooms,
  public.agent_sessions,
  public.runs,
  public.pending_decisions,
  public.audit_events,
  public.scheduled_jobs,
  public.notifications
to layalga_agent_runtime;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'homes', 'rooms', 'hosts', 'parties', 'invitations', 'visits',
    'visit_rooms', 'agent_sessions', 'runs', 'pending_decisions',
    'audit_events', 'scheduled_jobs', 'notifications', 'demo_clock',
    'demo_mutation_limits', 'demo_mutation_leases', 'host_identity_claims'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to layalga_web_runtime using (true) with check (true)',
      'web_runtime_access_' || table_name,
      table_name
    );
  end loop;

  foreach table_name in array array[
    'homes', 'rooms', 'hosts', 'parties', 'invitations', 'visits',
    'visit_rooms', 'agent_sessions', 'runs', 'pending_decisions',
    'audit_events', 'scheduled_jobs', 'notifications', 'demo_clock'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to layalga_agent_runtime using (true) with check (true)',
      'agent_runtime_access_' || table_name,
      table_name
    );
  end loop;
end
$$;

-- State-aware personal-data retention ------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.apply_data_retention(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  redacted_runs integer;
  deleted_sessions integer;
  redacted_invitations integer;
  redacted_visits integer;
  redacted_notifications integer;
  redacted_audits integer;
begin
  update public.runs as run
  set payload = '{}'::jsonb,
      result = null
  from public.homes as home
  where home.id = run.home_id
    and not home.demo
    and run.status in ('completed', 'failed')
    and coalesce(run.finished_at, run.started_at) < p_now - interval '30 days'
    and (run.payload <> '{}'::jsonb or run.result is not null)
    and not exists (
      select 1
      from public.pending_decisions as decision
      where decision.run_id = run.id
        and (
          decision.status = 'pending'
          or decision.applied_run_id is null
          or decision.application_error is not null
        )
    );
  get diagnostics redacted_runs = row_count;

  delete from public.agent_sessions as session
  where session.updated_at < p_now - interval '30 days'
    and not exists (
      select 1
      from public.runs as run
      where run.session_id = session.session_id
        and run.status in ('running', 'interrupted')
    )
    and not exists (
      select 1
      from public.pending_decisions as decision
      where decision.agent_session_id = session.session_id
        and (
          decision.status = 'pending'
          or decision.applied_run_id is null
          or decision.application_error is not null
        )
    )
    and not exists (
      select 1
      from public.scheduled_jobs as job
      join public.visits as visit on visit.id = job.visit_id
      where job.status in ('scheduled', 'running')
        and (
          session.session_id = 'tick_' || job.id::text
          or session.session_id = 'inv_' || visit.invitation_id::text
        )
    )
    and not exists (
      select 1
      from public.runs as run
      join public.homes as home on home.id = run.home_id
      where run.session_id = session.session_id
        and home.demo
    );
  get diagnostics deleted_sessions = row_count;

  update public.invitations as invitation
  set raw_message = '',
      structured = '{}'::jsonb
  from public.homes as home
  where home.id = invitation.home_id
    and not home.demo
    and invitation.created_at < p_now - interval '180 days'
    and (
      invitation.status in ('converted', 'cancelled')
      or invitation.link_token_expires_at < p_now - interval '180 days'
    )
    and (invitation.raw_message <> '' or invitation.structured <> '{}'::jsonb)
    and not exists (
      select 1
      from public.pending_decisions as decision
      where decision.agent_session_id = 'inv_' || invitation.id::text
        and (
          decision.status = 'pending'
          or decision.applied_run_id is null
          or decision.application_error is not null
        )
    )
    and not exists (
      select 1
      from public.visits as visit
      left join public.scheduled_jobs as job
        on job.visit_id = visit.id
       and job.status in ('scheduled', 'running')
      left join public.pending_decisions as decision
        on decision.visit_id = visit.id
       and (
         decision.status = 'pending'
         or decision.applied_run_id is null
         or decision.application_error is not null
       )
      where visit.invitation_id = invitation.id
        and (
          job.id is not null
          or decision.id is not null
          or (
            visit.status <> 'cancelled'
            and upper(visit.stay) >= (p_now - interval '180 days')::date
          )
        )
    );
  get diagnostics redacted_invitations = row_count;

  update public.visits as visit
  set special_requests = '{}'::text[]
  from public.homes as home
  where home.id = visit.home_id
    and not home.demo
    and visit.status in ('cancelled', 'reconfirmed')
    and upper(visit.stay) < (p_now - interval '180 days')::date
    and cardinality(visit.special_requests) > 0
    and not exists (
      select 1
      from public.pending_decisions as decision
      where decision.visit_id = visit.id
        and (
          decision.status = 'pending'
          or decision.applied_run_id is null
          or decision.application_error is not null
        )
    )
    and not exists (
      select 1
      from public.scheduled_jobs as job
      where job.visit_id = visit.id
        and job.status in ('scheduled', 'running')
    );
  get diagnostics redacted_visits = row_count;

  update public.notifications as notification
  set body_en = '[message expired]',
      body_es = '[mensaje caducado]'
  from public.homes as home
  where home.id = notification.home_id
    and not home.demo
    and notification.created_at < p_now - interval '180 days'
    and (
      notification.body_en <> '[message expired]'
      or notification.body_es <> '[mensaje caducado]'
    )
    and not exists (
      select 1
      from public.scheduled_jobs as job
      where job.id = notification.scheduled_job_id
        and job.status in ('scheduled', 'running')
    );
  get diagnostics redacted_notifications = row_count;

  update public.audit_events as audit
  set payload = '{}'::jsonb
  from public.homes as home
  where home.id = audit.home_id
    and not home.demo
    and audit.created_at < p_now - interval '365 days'
    and audit.payload <> '{}'::jsonb;
  get diagnostics redacted_audits = row_count;

  delete from cron.job_run_details
  where start_time < p_now - interval '30 days';

  return jsonb_build_object(
    'redactedRuns', redacted_runs,
    'deletedSessions', deleted_sessions,
    'redactedInvitations', redacted_invitations,
    'redactedVisits', redacted_visits,
    'redactedNotifications', redacted_notifications,
    'redactedAudits', redacted_audits
  );
end
$$;

revoke all on function private.apply_data_retention(timestamptz)
  from public, anon, authenticated, service_role,
       layalga_web_runtime, layalga_agent_runtime;

select cron.schedule(
  'layalga-data-retention',
  '17 3 * * *',
  $command$select private.apply_data_retention()$command$
);
