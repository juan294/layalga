update public.parties
set link_token_expires_at = greatest(created_at, now()) + interval '30 days'
where link_token_expires_at is null;

alter table public.parties
  alter column link_token_expires_at set default (now() + interval '30 days'),
  alter column link_token_expires_at set not null;
