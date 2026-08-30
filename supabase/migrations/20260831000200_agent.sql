create table public.runs (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  session_id text not null,
  task text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'interrupted', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.pending_decisions (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  visit_id uuid references public.visits (id) on delete cascade,
  run_id uuid not null references public.runs (id) on delete cascade,
  agent_session_id text not null,
  interrupt_id text not null,
  interrupt_name text not null,
  reason jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  decided_by_host_id uuid references public.hosts (id) on delete set null,
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (agent_session_id, interrupt_id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  actor text not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index runs_home_id_idx on public.runs (home_id);
create index runs_session_id_idx on public.runs (session_id);
create index runs_status_started_at_idx on public.runs (status, started_at);
create index pending_decisions_home_status_idx
  on public.pending_decisions (home_id, status);
create index pending_decisions_visit_id_idx
  on public.pending_decisions (visit_id)
  where visit_id is not null;
create index pending_decisions_run_id_idx on public.pending_decisions (run_id);
create index pending_decisions_decided_by_host_id_idx
  on public.pending_decisions (decided_by_host_id)
  where decided_by_host_id is not null;
create index audit_events_home_created_at_idx
  on public.audit_events (home_id, created_at);
create index audit_events_run_id_idx
  on public.audit_events (run_id)
  where run_id is not null;

alter table public.runs enable row level security;
alter table public.pending_decisions enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.runs from anon, authenticated;
revoke all on table public.pending_decisions from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;

alter table public.agent_sessions enable row level security;
revoke all on table public.agent_sessions from anon, authenticated;
