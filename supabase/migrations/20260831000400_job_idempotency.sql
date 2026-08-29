create unique index scheduled_jobs_one_open_kind_per_visit_idx
  on public.scheduled_jobs (visit_id, kind)
  where status in ('scheduled', 'running');

alter table public.notifications
  add column scheduled_job_id uuid
  references public.scheduled_jobs (id) on delete set null;

create index notifications_scheduled_job_id_idx
  on public.notifications (scheduled_job_id)
  where scheduled_job_id is not null;

create unique index notifications_reconfirmation_delivery_idx
  on public.notifications (scheduled_job_id, recipient_kind, recipient_id, kind)
  where scheduled_job_id is not null
    and kind in ('reconfirm_chase', 'reconfirm_escalation');
