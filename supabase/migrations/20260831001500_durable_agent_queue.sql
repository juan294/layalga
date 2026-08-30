alter table public.runs
  drop constraint runs_status_check,
  add constraint runs_status_check
    check (status in ('queued', 'running', 'completed', 'interrupted', 'failed')),
  add column queue_available_at timestamptz,
  add column queue_claimed_at timestamptz,
  add column queue_claim_token uuid,
  add column execution_attempt_count integer not null default 0
    check (execution_attempt_count between 0 and 3),
  add column last_error text;

update public.runs
set queue_available_at = coalesce(started_at, now()),
    queue_claimed_at = now(),
    queue_claim_token = gen_random_uuid(),
    execution_attempt_count = greatest(execution_attempt_count, 1),
    heartbeat_at = now(),
    deadline_at = greatest(
      coalesce(deadline_at, '-infinity'::timestamptz),
      now() + interval '4 minutes'
    )
where status = 'running';

create index runs_queue_claimable_idx
  on public.runs (queue_available_at, queue_claimed_at, id)
  where status in ('queued', 'running');

alter table public.scheduled_jobs
  drop constraint scheduled_jobs_status_check,
  add constraint scheduled_jobs_status_check
    check (status in ('scheduled', 'running', 'done', 'cancelled', 'quarantined')),
  add column available_at timestamptz,
  add column quarantined_at timestamptz,
  add column run_id uuid references public.runs (id) on delete set null;

update public.scheduled_jobs
set available_at = due_at
where available_at is null;

alter table public.scheduled_jobs
  alter column available_at set not null,
  alter column available_at set default now();

drop index public.scheduled_jobs_claimable_idx;

create index scheduled_jobs_claimable_idx
  on public.scheduled_jobs (available_at, due_at, claimed_at, id)
  where status in ('scheduled', 'running');

create unique index scheduled_jobs_run_id_idx
  on public.scheduled_jobs (run_id)
  where run_id is not null;
