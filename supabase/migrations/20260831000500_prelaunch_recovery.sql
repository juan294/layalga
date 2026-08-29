alter table public.runs
  add column heartbeat_at timestamptz,
  add column deadline_at timestamptz;

update public.runs
set heartbeat_at = started_at,
    deadline_at = started_at + interval '6 minutes'
where status = 'running';

create index runs_stale_deadline_idx
  on public.runs (deadline_at)
  where status = 'running';

alter table public.pending_decisions
  add column application_error text,
  add column applied_run_id uuid references public.runs (id) on delete set null;

create index pending_decisions_retry_idx
  on public.pending_decisions (home_id, created_at)
  where status in ('approved', 'declined') and applied_run_id is null;

alter table public.scheduled_jobs
  add column claimed_at timestamptz,
  add column claim_token uuid,
  add column attempt_count integer not null default 0
    check (attempt_count >= 0),
  add column last_error text;

update public.scheduled_jobs
set status = 'scheduled',
    last_error = 'Recovered during lease migration'
where status = 'running';

create index scheduled_jobs_claimable_idx
  on public.scheduled_jobs (due_at, claimed_at)
  where status in ('scheduled', 'running');
