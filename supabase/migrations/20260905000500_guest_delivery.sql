create table public.guest_contacts (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique,
  home_id uuid not null references public.homes(id) on delete cascade,
  party_id uuid not null,
  email text not null,
  locale text not null check(locale in ('en','es')),
  generation integer not null default 1 check(generation > 0),
  consent boolean not null default false,
  verified_at timestamptz,
  requested_at timestamptz not null,
  rate_window_at timestamptz not null,
  rate_count integer not null default 1 check(rate_count between 1 and 3),
  updated_at timestamptz not null default now(),
  unique(id,home_id),
  foreign key(invitation_id,home_id) references public.invitations(id,home_id) on delete cascade,
  foreign key(party_id,home_id) references public.parties(id,home_id) on delete cascade
);
create table public.guest_email_outbox (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  contact_id uuid not null,
  generation integer not null,
  kind text not null check(kind in ('verification','reconfirm_chase')),
  source_id uuid not null,
  status text not null default 'queued' check(status in ('queued','sending','sent','failed','cancelled')),
  attempts integer not null default 0 check(attempts between 0 and 3),
  available_at timestamptz not null,
  claim_token uuid,
  lease_until timestamptz,
  message_id text,
  error_name text,
  created_at timestamptz not null,
  sent_at timestamptz,
  unique(kind,source_id,contact_id,generation),
  foreign key(contact_id,home_id) references public.guest_contacts(id,home_id) on delete cascade
);
create index guest_email_outbox_dispatch_idx on public.guest_email_outbox(status,available_at);
alter table public.guest_contacts enable row level security;
alter table public.guest_email_outbox enable row level security;
revoke all on public.guest_contacts, public.guest_email_outbox
  from public, anon, authenticated, service_role, layalga_agent_runtime;
grant select,insert,update,delete on public.guest_contacts, public.guest_email_outbox to layalga_web_runtime;
create policy web_runtime_guest_contacts on public.guest_contacts for all to layalga_web_runtime using(true) with check(true);
create policy web_runtime_guest_email_outbox on public.guest_email_outbox for all to layalga_web_runtime using(true) with check(true);

-- Retain the existing owner-operated maintenance procedure and append the new
-- private contact/outbox lifecycle. Neither runtime can invoke either function.
alter function private.apply_data_retention(timestamptz) rename to apply_data_retention_before_guest_delivery;
create function private.apply_data_retention(p_now timestamptz default now())
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; deleted_guest_emails integer; deleted_guest_contacts integer;
begin
  result := private.apply_data_retention_before_guest_delivery(p_now);
  delete from public.guest_email_outbox where created_at < p_now - interval '90 days';
  get diagnostics deleted_guest_emails = row_count;
  delete from public.guest_contacts contact
  using public.invitations invitation
  where invitation.id = contact.invitation_id
    and contact.updated_at < p_now - interval '180 days'
    and (invitation.status = 'cancelled'
      or invitation.link_token_expires_at < p_now - interval '180 days'
      or exists(select 1 from public.visits visit where visit.invitation_id = invitation.id
        and upper(visit.stay) < (p_now - interval '180 days')::date))
    and not exists(select 1 from public.visits visit where visit.invitation_id = invitation.id
      and visit.status <> 'cancelled' and (upper_inf(visit.stay)
        or upper(visit.stay) >= (p_now - interval '180 days')::date));
  get diagnostics deleted_guest_contacts = row_count;
  return result || jsonb_build_object('deletedGuestEmails',deleted_guest_emails,'deletedGuestContacts',deleted_guest_contacts);
end $$;
revoke all on function private.apply_data_retention(timestamptz)
  from public, anon, authenticated, service_role, layalga_web_runtime, layalga_agent_runtime;
