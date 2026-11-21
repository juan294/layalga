-- Private proposals do not reserve inventory. Only the trusted web runtime
-- submits, reads and transitions them on behalf of a verified user or host.
alter table public.household_public_listings add unique (handle, home_id);
create table public.stay_requests (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  listing_handle uuid not null,
  display_name text not null,
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_email text check (char_length(requester_email) between 3 and 320),
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  stay daterange check (not isempty(stay) and not lower_inf(stay) and not upper_inf(stay)
    and upper(stay) - lower(stay) between 1 and 30),
  adults integer check (adults between 1 and 12),
  children integer check (children between 0 and 12),
  pets integer check (pets between 0 and 6),
  room_ids uuid[] not null,
  room_terms jsonb not null,
  overflow_consent boolean not null,
  notes text not null check (char_length(notes) <= 1000),
  requests text not null check (char_length(requests) <= 500),
  locale text not null check (locale in ('en','es')),
  status text not null default 'pending'
    check (status in ('pending','confirmed','declined','withdrawn','expired','needs_new_selection')),
  version integer not null default 1 check (version > 0),
  visit_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terminal_at timestamptz,
  unique (id, home_id),
  unique (home_id, requester_id, idempotency_key),
  foreign key (listing_handle, home_id) references public.household_public_listings(handle, home_id) on delete cascade,
  foreign key (visit_id, home_id) references public.visits(id, home_id) on delete cascade,
  check ((status = 'pending') = (terminal_at is null)),
  check ((status = 'confirmed') = (visit_id is not null)),
  check (jsonb_typeof(room_terms) = 'array' and jsonb_array_length(room_terms) = cardinality(room_ids)),
  check ((status = 'confirmed' and stay is null and cardinality(room_ids) = 0) or
    (stay is not null and adults is not null and children is not null and pets is not null
     and requester_email is not null and cardinality(room_ids) between 1 and 20))
);
create index stay_requests_pending_home on public.stay_requests(home_id, created_at, id) where status = 'pending';
create index stay_requests_requester on public.stay_requests(requester_id, created_at desc, id);

create function private.check_stay_request_rooms()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (select count(*) from public.rooms where home_id = new.home_id and id = any(new.room_ids))
      <> cardinality(new.room_ids) then
    raise exception 'Stay request rooms must be distinct and belong to its household' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.check_stay_request_rooms()
  from public, anon, authenticated, service_role, layalga_web_runtime, layalga_agent_runtime;
create trigger check_stay_request_rooms before insert or update of home_id, room_ids on public.stay_requests
  for each row execute function private.check_stay_request_rooms();

alter table public.stay_requests enable row level security;
revoke all on public.stay_requests from public, anon, authenticated, service_role, layalga_web_runtime, layalga_agent_runtime;
grant select, insert on public.stay_requests to layalga_web_runtime;
grant update (status, version, visit_id, updated_at, terminal_at) on public.stay_requests to layalga_web_runtime;
create policy web_runtime_stay_requests on public.stay_requests for all to layalga_web_runtime
  using (true) with check (true);

alter function private.apply_data_retention(timestamptz) rename to apply_data_retention_before_stay_requests;
create function private.apply_data_retention(p_now timestamptz default now())
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; expired integer; deleted integer; scrubbed integer;
begin
  result := private.apply_data_retention_before_stay_requests(p_now);
  update public.stay_requests r set status='expired', version=version+1, updated_at=p_now,
    terminal_at=(lower(r.stay)+1)::timestamp at time zone h.timezone
    from public.homes h where r.home_id=h.id and r.status='pending'
    and lower(r.stay) < (p_now at time zone h.timezone)::date;
  get diagnostics expired = row_count;
  delete from public.stay_requests where status <> 'confirmed' and terminal_at < p_now-interval '30 days';
  get diagnostics deleted = row_count;
  -- The canonical visit now supplies the stay and party details. Keep the
  -- private account association, receipt and replay key only while it exists.
  update public.stay_requests set requester_email=null, stay=null, adults=null, children=null, pets=null,
    room_ids='{}', room_terms='[]', notes='', requests='', overflow_consent=false
    where status='confirmed' and stay is not null;
  get diagnostics scrubbed = row_count;
  return result || jsonb_build_object('expiredStayRequests',expired,'deletedStayRequests',deleted,'scrubbedStayRequests',scrubbed);
end $$;
revoke all on function private.apply_data_retention(timestamptz)
  from public, anon, authenticated, service_role, layalga_web_runtime, layalga_agent_runtime;
