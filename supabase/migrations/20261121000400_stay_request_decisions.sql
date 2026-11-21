-- Only the household that owns the request may supply its decision actor.
alter table public.stay_requests
  add column decided_by_host_id uuid,
  add foreign key (decided_by_host_id, home_id)
    references public.hosts(id, home_id) on delete set null (decided_by_host_id);
grant update (decided_by_host_id) on public.stay_requests to layalga_web_runtime;
