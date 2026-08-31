alter table public.rooms
  alter column beds drop not null,
  add column guest_label text,
  add column floor_label text,
  add column sleeping_arrangement text,
  add column overflow_arrangement text,
  add column maximum_capacity integer,
  add column inventory_state text not null default 'draft',
  add column overflow_policy text not null default 'none',
  add column display_order integer not null default 0,
  add column private_notes text;

update public.rooms as room
set guest_label = case when home.demo then room.name else null end,
    floor_label = case when home.demo then 'Unspecified' else null end,
    sleeping_arrangement = case
      when home.demo then format('Standard capacity: %s', room.beds)
      else null
    end,
    maximum_capacity = room.beds,
    inventory_state = case when home.demo then 'available' else 'draft' end,
    overflow_policy = 'none'
from public.homes as home
where home.id = room.home_id;

alter table public.rooms
  add constraint rooms_inventory_state_check
    check (inventory_state in ('draft', 'available', 'withheld', 'inactive')),
  add constraint rooms_overflow_policy_check
    check (overflow_policy in ('none', 'host_approval')),
  add constraint rooms_maximum_capacity_check
    check (maximum_capacity is null or maximum_capacity > 0),
  add constraint rooms_ready_inventory_check check (
    inventory_state in ('draft', 'inactive')
    or (
      nullif(btrim(guest_label), '') is not null
      and nullif(btrim(floor_label), '') is not null
      and nullif(btrim(sleeping_arrangement), '') is not null
      and beds is not null
      and maximum_capacity is not null
    )
  ),
  add constraint rooms_capacity_order_check
    check (
      beds is null
      or maximum_capacity is null
      or maximum_capacity >= beds
    ),
  add constraint rooms_overflow_consistency_check check (
    beds is null
    or maximum_capacity is null
    or (
      maximum_capacity = beds
      and overflow_policy = 'none'
      and overflow_arrangement is null
    )
    or (
      maximum_capacity > beds
      and overflow_policy = 'host_approval'
      and nullif(btrim(overflow_arrangement), '') is not null
    )
  );

create index rooms_inventory_order_idx
  on public.rooms (home_id, inventory_state, display_order, id);

create table public.room_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  room_id uuid not null,
  stay daterange not null check (not isempty(stay)),
  action text not null check (action in ('open', 'close')),
  created_by_host_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  private_note text,
  created_at timestamptz not null default now(),
  unique (home_id, idempotency_key),
  constraint room_availability_overrides_room_home_fk
    foreign key (room_id, home_id)
    references public.rooms (id, home_id) on delete cascade,
  constraint room_availability_overrides_host_home_fk
    foreign key (created_by_host_id, home_id)
    references public.hosts (id, home_id) on delete restrict,
  constraint room_availability_overrides_no_overlap
    exclude using gist (room_id with =, stay with &&)
);

create index room_availability_overrides_home_stay_idx
  on public.room_availability_overrides using gist (home_id, stay);
create index room_availability_overrides_host_id_idx
  on public.room_availability_overrides (created_by_host_id);

create table public.private_room_blocks (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  stay daterange not null check (not isempty(stay)),
  status text not null default 'active'
    check (status in ('active', 'cancelled')),
  public_label text not null check (nullif(btrim(public_label), '') is not null),
  private_note text,
  created_by_host_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  calendar_eligible_at timestamptz,
  calendar_updated_at timestamptz,
  calendar_sequence integer not null default 0 check (calendar_sequence >= 0),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, home_id),
  unique (home_id, idempotency_key),
  constraint private_room_blocks_host_home_fk
    foreign key (created_by_host_id, home_id)
    references public.hosts (id, home_id) on delete restrict,
  constraint private_room_blocks_cancelled_state_check check (
    (status = 'active' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create index private_room_blocks_home_stay_idx
  on public.private_room_blocks using gist (home_id, stay);
create index private_room_blocks_host_id_idx
  on public.private_room_blocks (created_by_host_id);

alter table public.visit_rooms
  alter column visit_id drop not null,
  add column private_block_id uuid,
  add constraint visit_rooms_private_block_home_fk
    foreign key (private_block_id, home_id)
    references public.private_room_blocks (id, home_id) on delete cascade,
  add constraint visit_rooms_exactly_one_source_check
    check (num_nonnulls(visit_id, private_block_id) = 1);

create unique index visit_rooms_private_block_room_idx
  on public.visit_rooms (private_block_id, room_id)
  where private_block_id is not null;

alter table public.visits
  add column calendar_eligible_at timestamptz,
  add column calendar_updated_at timestamptz,
  add column calendar_sequence integer not null default 0
    check (calendar_sequence >= 0);

update public.visits
set calendar_eligible_at = coalesce(confirmed_at, created_at),
    calendar_updated_at = coalesce(confirmed_at, created_at),
    calendar_sequence = 0
where status in (
    'confirmed', 'reconfirm_pending', 'reconfirmed', 'escalated'
  )
  and calendar_eligible_at is null;

create table public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  created_by_host_id uuid not null,
  label text not null check (nullif(btrim(label), '') is not null),
  locale text not null check (locale in ('en', 'es')),
  token_hash bytea not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint calendar_feeds_host_home_fk
    foreign key (created_by_host_id, home_id)
    references public.hosts (id, home_id) on delete restrict
);

create index calendar_feeds_home_active_idx
  on public.calendar_feeds (home_id, created_at, id)
  where revoked_at is null;
create index calendar_feeds_host_id_idx
  on public.calendar_feeds (created_by_host_id);

create table public.room_action_proposals (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  requested_by_host_id uuid not null,
  run_id uuid,
  kind text not null check (kind in ('private_block', 'open', 'close')),
  stay daterange not null check (not isempty(stay)),
  summary text not null check (nullif(btrim(summary), '') is not null),
  private_note text,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'dismissed')),
  idempotency_key text not null,
  request_hash text not null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, home_id),
  unique (home_id, idempotency_key),
  constraint room_action_proposals_host_home_fk
    foreign key (requested_by_host_id, home_id)
    references public.hosts (id, home_id) on delete restrict,
  constraint room_action_proposals_run_home_fk
    foreign key (run_id, home_id)
    references public.runs (id, home_id) on delete set null (run_id),
  constraint room_action_proposals_applied_state_check check (
    (status = 'applied' and applied_at is not null)
    or (status <> 'applied' and applied_at is null)
  )
);

create index room_action_proposals_home_status_idx
  on public.room_action_proposals (home_id, status, created_at, id);
create index room_action_proposals_host_id_idx
  on public.room_action_proposals (requested_by_host_id);
create index room_action_proposals_run_id_idx
  on public.room_action_proposals (run_id)
  where run_id is not null;

create table public.room_action_proposal_rooms (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  room_id uuid not null,
  home_id uuid not null references public.homes (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (proposal_id, room_id),
  constraint room_action_proposal_rooms_proposal_home_fk
    foreign key (proposal_id, home_id)
    references public.room_action_proposals (id, home_id) on delete cascade,
  constraint room_action_proposal_rooms_room_home_fk
    foreign key (room_id, home_id)
    references public.rooms (id, home_id) on delete cascade
);

create index room_action_proposal_rooms_room_id_idx
  on public.room_action_proposal_rooms (room_id);
create index room_action_proposal_rooms_home_id_idx
  on public.room_action_proposal_rooms (home_id);

alter table public.room_availability_overrides enable row level security;
alter table public.private_room_blocks enable row level security;
alter table public.calendar_feeds enable row level security;
alter table public.room_action_proposals enable row level security;
alter table public.room_action_proposal_rooms enable row level security;

revoke all on table public.room_availability_overrides
  from public, anon, authenticated, service_role;
revoke all on table public.private_room_blocks
  from public, anon, authenticated, service_role;
revoke all on table public.calendar_feeds
  from public, anon, authenticated, service_role;
revoke all on table public.room_action_proposals
  from public, anon, authenticated, service_role;
revoke all on table public.room_action_proposal_rooms
  from public, anon, authenticated, service_role;

grant select, insert, update on table
  public.room_availability_overrides,
  public.private_room_blocks,
  public.calendar_feeds,
  public.room_action_proposals
to layalga_web_runtime;
grant delete on table public.room_availability_overrides
  to layalga_web_runtime;
grant select, insert on table public.room_action_proposal_rooms
  to layalga_web_runtime;

create policy web_runtime_access_room_availability_overrides
  on public.room_availability_overrides
  for all to layalga_web_runtime using (true) with check (true);
create policy web_runtime_access_private_room_blocks
  on public.private_room_blocks
  for all to layalga_web_runtime using (true) with check (true);
create policy web_runtime_access_calendar_feeds
  on public.calendar_feeds
  for all to layalga_web_runtime using (true) with check (true);
create policy web_runtime_access_room_action_proposals
  on public.room_action_proposals
  for all to layalga_web_runtime using (true) with check (true);
create policy web_runtime_access_room_action_proposal_rooms
  on public.room_action_proposal_rooms
  for all to layalga_web_runtime using (true) with check (true);

revoke select on table public.rooms from layalga_agent_runtime;
grant select (
  id,
  home_id,
  name,
  beds,
  guest_label,
  floor_label,
  sleeping_arrangement,
  overflow_arrangement,
  maximum_capacity,
  inventory_state,
  overflow_policy,
  display_order,
  created_at
) on public.rooms to layalga_agent_runtime;

revoke all on table public.visit_rooms from layalga_agent_runtime;
grant select, delete on table public.visit_rooms to layalga_agent_runtime;
grant insert (visit_id, room_id, home_id, stay)
  on public.visit_rooms to layalga_agent_runtime;

drop policy agent_runtime_access_visit_rooms on public.visit_rooms;
create policy agent_runtime_select_visit_rooms
  on public.visit_rooms
  for select to layalga_agent_runtime using (true);
create policy agent_runtime_insert_visit_rooms
  on public.visit_rooms
  for insert to layalga_agent_runtime
  with check (visit_id is not null and private_block_id is null);
create policy agent_runtime_delete_visit_rooms
  on public.visit_rooms
  for delete to layalga_agent_runtime
  using (visit_id is not null and private_block_id is null);

grant select (
  id,
  home_id,
  room_id,
  stay,
  action,
  created_at
) on public.room_availability_overrides to layalga_agent_runtime;
create policy agent_runtime_select_room_availability_overrides
  on public.room_availability_overrides
  for select to layalga_agent_runtime using (true);

grant select (
  id,
  home_id,
  requested_by_host_id,
  run_id,
  kind,
  stay,
  summary,
  status,
  applied_at,
  created_at
) on public.room_action_proposals to layalga_agent_runtime;
grant insert (
  home_id,
  requested_by_host_id,
  run_id,
  kind,
  stay,
  summary,
  idempotency_key,
  request_hash
) on public.room_action_proposals to layalga_agent_runtime;
create policy agent_runtime_select_room_action_proposals
  on public.room_action_proposals
  for select to layalga_agent_runtime using (true);
create policy agent_runtime_insert_room_action_proposals
  on public.room_action_proposals
  for insert to layalga_agent_runtime with check (status = 'pending');

grant select, insert on table public.room_action_proposal_rooms
  to layalga_agent_runtime;
create policy agent_runtime_select_room_action_proposal_rooms
  on public.room_action_proposal_rooms
  for select to layalga_agent_runtime using (true);
create policy agent_runtime_insert_room_action_proposal_rooms
  on public.room_action_proposal_rooms
  for insert to layalga_agent_runtime with check (true);
