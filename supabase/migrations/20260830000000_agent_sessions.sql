create table public.agent_sessions (
  key text primary key,
  session_id text not null,
  data bytea not null,
  updated_at timestamptz not null default now()
);

create index agent_sessions_session_id_idx
  on public.agent_sessions (session_id);

alter table public.agent_sessions enable row level security;
revoke all on table public.agent_sessions from anon, authenticated;

create table public.spike_holds (
  id bigint generated always as identity primary key,
  label text not null,
  created_at timestamptz not null default now()
);

alter table public.spike_holds enable row level security;
revoke all on table public.spike_holds from anon, authenticated;
