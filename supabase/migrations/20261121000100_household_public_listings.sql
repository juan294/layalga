-- A household appears in discovery only after one of its hosts publishes it.
create table public.household_public_listings (
  home_id uuid primary key references public.homes(id) on delete cascade,
  handle uuid not null unique default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 80),
  search_name text not null check (char_length(search_name) between 2 and 160),
  published boolean not null default false
);

alter table public.household_public_listings enable row level security;
revoke all on public.household_public_listings
  from public, anon, authenticated, service_role, layalga_agent_runtime, layalga_web_runtime;
grant select on public.household_public_listings to layalga_web_runtime;
grant insert (home_id, display_name, search_name, published),
  update (display_name, search_name, published)
  on public.household_public_listings to layalga_web_runtime;
create policy web_runtime_household_public_listings on public.household_public_listings
  for all to layalga_web_runtime using (true) with check (true);
