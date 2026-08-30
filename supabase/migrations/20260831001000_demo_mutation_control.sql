create table public.demo_mutation_limits (
  home_id uuid not null,
  session_id uuid not null,
  action text not null check (action in ('clock', 'reset')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (home_id, session_id, action)
);

create table public.demo_mutation_leases (
  home_id uuid primary key references public.homes (id) on delete cascade,
  session_id uuid not null,
  lease_token uuid not null,
  expires_at timestamptz not null
);

alter table public.demo_mutation_limits enable row level security;
alter table public.demo_mutation_leases enable row level security;
revoke all on table public.demo_mutation_limits from anon, authenticated;
revoke all on table public.demo_mutation_leases from anon, authenticated;
