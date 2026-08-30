alter table public.scheduled_jobs
  add column schedule_claimed_at timestamptz,
  add column schedule_claim_token uuid;

create index scheduled_jobs_schedule_claim_idx
  on public.scheduled_jobs (schedule_claimed_at)
  where external_ref is null and status in ('scheduled', 'running');
