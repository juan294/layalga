create table private.review_access_events (
  session_id uuid primary key,
  access_mode text not null
    check (access_mode in ('host', 'guest')),
  locale text not null
    check (locale in ('en', 'es')),
  created_at timestamptz not null default now()
);

create index review_access_events_created_at_idx
  on private.review_access_events (created_at);

alter table private.review_access_events enable row level security;

revoke all on table private.review_access_events
  from public, anon, authenticated, service_role, layalga_agent_runtime;
grant select, insert on table private.review_access_events
  to layalga_web_runtime;

create policy web_runtime_read_review_access_events
  on private.review_access_events
  for select
  to layalga_web_runtime
  using (true);

create policy web_runtime_insert_review_access_events
  on private.review_access_events
  for insert
  to layalga_web_runtime
  with check (true);

comment on table private.review_access_events is
  'Minimal, non-identifying record of successful public demo entry.';
