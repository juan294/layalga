create table public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  visit_id uuid not null references public.visits (id) on delete cascade,
  kind text not null
    check (kind in ('reconfirm_chase', 'reconfirm_escalate')),
  due_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'done', 'cancelled')),
  external_ref text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  recipient_kind text not null check (recipient_kind in ('host', 'party')),
  recipient_id uuid not null,
  visit_id uuid references public.visits (id) on delete cascade,
  kind text not null,
  body_en text not null,
  body_es text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.demo_clock (
  home_id uuid primary key references public.homes (id) on delete cascade,
  now timestamptz not null,
  enabled boolean not null default true
);

create index scheduled_jobs_status_due_at_idx
  on public.scheduled_jobs (status, due_at);
create index scheduled_jobs_home_id_idx on public.scheduled_jobs (home_id);
create index scheduled_jobs_visit_id_idx on public.scheduled_jobs (visit_id);
create unique index scheduled_jobs_external_ref_idx
  on public.scheduled_jobs (external_ref)
  where external_ref is not null;
create index notifications_home_created_at_idx
  on public.notifications (home_id, created_at);
create index notifications_recipient_idx
  on public.notifications (recipient_kind, recipient_id, read_at);
create index notifications_visit_id_idx
  on public.notifications (visit_id)
  where visit_id is not null;

alter table public.scheduled_jobs enable row level security;
alter table public.notifications enable row level security;
alter table public.demo_clock enable row level security;

revoke all on table public.scheduled_jobs from anon, authenticated;
revoke all on table public.notifications from anon, authenticated;
revoke all on table public.demo_clock from anon, authenticated;
