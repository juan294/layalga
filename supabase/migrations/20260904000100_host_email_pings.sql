-- Host email pings through Amazon SES ------------------------------------------
--
-- The web runtime owns delivery: it can read host_identity_claims and holds
-- the SES rights, so both new tables are web-runtime only. The agent runtime
-- gets no grant on either table.

create table public.host_email_pings (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  host_id uuid not null,
  kind text not null
    check (kind in ('pending_decision', 'reconfirm_escalation')),
  source_id uuid not null,
  to_address text not null,
  subject text not null,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed')),
  message_id text,
  error_name text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (kind, source_id, host_id),
  constraint host_email_pings_host_home_fk
    foreign key (host_id, home_id)
    references public.hosts (id, home_id) on delete cascade
);

create index host_email_pings_home_status_idx
  on public.host_email_pings (home_id, status);
create index host_email_pings_retry_idx
  on public.host_email_pings (status, created_at)
  where status in ('sending', 'failed');

create table public.host_notification_settings (
  host_id uuid primary key,
  home_id uuid not null,
  email_pings boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint host_notification_settings_host_home_fk
    foreign key (host_id, home_id)
    references public.hosts (id, home_id) on delete cascade
);

alter table public.host_email_pings enable row level security;
alter table public.host_notification_settings enable row level security;

revoke all on table public.host_email_pings
  from public, anon, authenticated, service_role;
revoke all on table public.host_notification_settings
  from public, anon, authenticated, service_role;

grant select, insert, update on table
  public.host_email_pings,
  public.host_notification_settings
to layalga_web_runtime;

create policy web_runtime_access_host_email_pings
  on public.host_email_pings
  for all to layalga_web_runtime using (true) with check (true);
create policy web_runtime_access_host_notification_settings
  on public.host_notification_settings
  for all to layalga_web_runtime using (true) with check (true);

-- Retention: fold host_email_pings into the existing daily maintenance pass -----

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
  deleted_email_pings integer;
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

  delete from public.host_email_pings as ping
  using public.homes as home
  where home.id = ping.home_id
    and not home.demo
    and ping.created_at < p_now - interval '90 days';
  get diagnostics deleted_email_pings = row_count;

  delete from cron.job_run_details
  where start_time < p_now - interval '30 days';

  return jsonb_build_object(
    'redactedRuns', redacted_runs,
    'deletedSessions', deleted_sessions,
    'redactedInvitations', redacted_invitations,
    'redactedVisits', redacted_visits,
    'redactedNotifications', redacted_notifications,
    'redactedAudits', redacted_audits,
    'deletedEmailPings', deleted_email_pings
  );
end
$$;

revoke all on function private.apply_data_retention(timestamptz)
  from public, anon, authenticated, service_role,
       layalga_web_runtime, layalga_agent_runtime;
