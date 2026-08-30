create table public.homes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  timezone text not null,
  pets_together_allowed boolean not null default false,
  max_families_with_children integer not null default 1
    check (max_families_with_children >= 1),
  demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  name text not null,
  beds integer not null check (beds > 0),
  created_at timestamptz not null default now(),
  unique (home_id, name)
);

create table public.hosts (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  display_name text not null,
  locale text not null check (locale in ('en', 'es')),
  auth_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (home_id, display_name)
);

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  family_name text not null,
  locale text not null check (locale in ('en', 'es')),
  link_token text not null unique,
  link_token_expires_at timestamptz,
  auth_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (home_id, family_name)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  host_id uuid not null references public.hosts (id) on delete cascade,
  party_id uuid not null references public.parties (id) on delete cascade,
  raw_message text not null,
  structured jsonb not null default '{}'::jsonb,
  status text not null default 'tentative'
    check (status in ('tentative', 'sent', 'converted', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  party_id uuid not null references public.parties (id) on delete cascade,
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  stay daterange not null check (not isempty(stay)),
  adults integer not null check (adults >= 0),
  children integer not null default 0 check (children >= 0),
  pets integer not null default 0 check (pets >= 0),
  special_requests text[] not null default '{}'::text[],
  status text not null default 'hold'
    check (status in (
      'hold',
      'confirmed',
      'reconfirm_pending',
      'reconfirmed',
      'escalated',
      'cancelled'
    )),
  hold_expires_at timestamptz,
  confirmed_at timestamptz,
  reconfirm_requested_at timestamptz,
  reconfirmed_at timestamptz,
  escalated_at timestamptz,
  approval_stay_hash text,
  created_at timestamptz not null default now()
);

create table public.visit_rooms (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  stay daterange not null check (not isempty(stay)),
  created_at timestamptz not null default now(),
  unique (visit_id, room_id),
  constraint visit_rooms_no_overlap
    exclude using gist (room_id with =, stay with &&)
);

create index rooms_home_id_idx on public.rooms (home_id);
create index hosts_home_id_idx on public.hosts (home_id);
create index hosts_auth_user_id_idx on public.hosts (auth_user_id)
  where auth_user_id is not null;
create index parties_home_id_idx on public.parties (home_id);
create index parties_auth_user_id_idx on public.parties (auth_user_id)
  where auth_user_id is not null;
create index invitations_home_id_idx on public.invitations (home_id);
create index invitations_host_id_idx on public.invitations (host_id);
create index invitations_party_id_idx on public.invitations (party_id);
create index visits_home_stay_idx on public.visits using gist (home_id, stay);
create index visits_party_id_idx on public.visits (party_id);
create index visits_invitation_id_idx on public.visits (invitation_id);
create index visit_rooms_visit_id_idx on public.visit_rooms (visit_id);
create index visit_rooms_room_id_idx on public.visit_rooms (room_id);

alter table public.homes enable row level security;
alter table public.rooms enable row level security;
alter table public.hosts enable row level security;
alter table public.parties enable row level security;
alter table public.invitations enable row level security;
alter table public.visits enable row level security;
alter table public.visit_rooms enable row level security;

revoke all on table public.homes from anon, authenticated;
revoke all on table public.rooms from anon, authenticated;
revoke all on table public.hosts from anon, authenticated;
revoke all on table public.parties from anon, authenticated;
revoke all on table public.invitations from anon, authenticated;
revoke all on table public.visits from anon, authenticated;
revoke all on table public.visit_rooms from anon, authenticated;
