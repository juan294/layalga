-- Preserve provider acceptance independently of subsequent consent/source changes.
alter table public.guest_email_outbox add unique(id,home_id);
create table public.guest_email_attempts (
  claim_token uuid primary key,
  outbox_id uuid not null,
  home_id uuid not null,
  status text not null check(status in ('authorized','accepted','failed','unknown')),
  authorized_at timestamptz not null,
  accepted_at timestamptz,
  message_id text,
  foreign key(outbox_id,home_id) references public.guest_email_outbox(id,home_id) on delete cascade
);
alter table public.guest_email_attempts enable row level security;
revoke all on public.guest_email_attempts from public,anon,authenticated,service_role,layalga_agent_runtime;
grant select,insert,update on public.guest_email_attempts to layalga_web_runtime;
create policy web_runtime_guest_email_attempts on public.guest_email_attempts
  for all to layalga_web_runtime using(true) with check(true);
-- Attempts cascade with their outbox record under the existing 90-day rule.
