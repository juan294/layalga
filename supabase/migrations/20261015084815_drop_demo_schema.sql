-- Contract step of the real-use launch (release 2). Removes the demo schema
-- after release 1 runs on both Vercel and AgentCore without reading it.
--
-- Fails closed while any home is still a demo home, so it can never run before
-- the household conversion. Written to be re-runnable: the guard checks the
-- column before reading it, and every drop tolerates an absent object.

do $$
begin
  -- PL/pgSQL plans the inner statement only when it runs, so a re-run after
  -- the column is gone never reads it.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'homes' and column_name = 'demo'
  ) then
    if exists (select 1 from public.homes where demo) then
      raise exception 'demo homes still exist; apply the conversion first';
    end if;
  end if;
end
$$;

-- The retention body from 20260905000300_guest_notes.sql without the demo
-- predicates; the outer wrapper from 20260905000500_guest_delivery.sql calls
-- it unchanged.
create or replace function private.apply_data_retention_before_guest_delivery(
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
  where run.status in ('completed', 'failed')
    and coalesce(run.finished_at, run.started_at) < p_now - interval '30 days'
    and (run.payload <> '{}'::jsonb or run.result is not null)
    and not exists (
      select 1
      from public.pending_decisions as decision
      where decision.run_id = run.id
        and decision.status <> 'cancelled'
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
        and decision.status <> 'cancelled'
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
    );
  get diagnostics deleted_sessions = row_count;

  update public.invitations as invitation
  set raw_message = '',
      structured = '{}'::jsonb
  where invitation.created_at < p_now - interval '180 days'
    and (
      invitation.status in ('converted', 'cancelled')
      or invitation.link_token_expires_at < p_now - interval '180 days'
    )
    and (invitation.raw_message <> '' or invitation.structured <> '{}'::jsonb)
    and not exists (
      select 1
      from public.pending_decisions as decision
      where decision.agent_session_id = 'inv_' || invitation.id::text
        and decision.status <> 'cancelled'
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
       and decision.status <> 'cancelled'
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
  set special_requests = '{}'::text[], guest_notes = ''
  where visit.status in ('cancelled', 'reconfirmed')
    and upper(visit.stay) < (p_now - interval '180 days')::date
    and (cardinality(visit.special_requests) > 0 or visit.guest_notes <> '')
    and not exists (
      select 1
      from public.pending_decisions as decision
      where decision.visit_id = visit.id
        and decision.status <> 'cancelled'
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
  where notification.created_at < p_now - interval '180 days'
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
  where audit.created_at < p_now - interval '365 days'
    and audit.payload <> '{}'::jsonb;
  get diagnostics redacted_audits = row_count;

  delete from public.host_email_pings as ping
  where ping.created_at < p_now - interval '90 days';
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

revoke all on function private.apply_data_retention_before_guest_delivery(timestamptz)
  from public, anon, authenticated, service_role,
       layalga_web_runtime, layalga_agent_runtime;

drop function if exists private.restore_demo_identity_claims();
drop table if exists public.demo_clock;
drop table if exists public.demo_mutation_leases;
drop table if exists public.demo_mutation_limits;
drop table if exists private.review_access_events;
alter table public.homes drop column if exists demo;

-- The web runtime used the private schema only for the two objects dropped
-- above (grants checked against pg_class, pg_proc and
-- information_schema.role_table_grants on 2026-10-15).
revoke usage on schema private from layalga_web_runtime;
