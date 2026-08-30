do $$
declare
  juan_claim_user_id uuid;
  juan_host_user_id uuid;
  juan_auth_user_id uuid;
  jordan_host_user_id uuid;
  jordan_auth_user_id uuid;
begin
  if not exists (
    select 1
    from public.homes
    where id = '00000000-0000-4000-8000-000000000001'::uuid
      and demo = true
  ) then
    return;
  end if;

  select auth_user_id
  into juan_claim_user_id
  from public.host_identity_claims
  where normalized_email = 'juan294@gmail.com';

  select auth_user_id
  into juan_host_user_id
  from public.hosts
  where id = '00000000-0000-4000-8000-000000000201'::uuid
    and home_id = '00000000-0000-4000-8000-000000000001'::uuid;

  if not found then
    raise exception 'Cannot restore real host identities: Juan host is missing';
  end if;

  select id
  into juan_auth_user_id
  from auth.users
  where lower(btrim(email)) = 'juan294@gmail.com'
  order by created_at, id
  limit 1;

  if juan_claim_user_id is not null
     and juan_host_user_id is not null
     and juan_claim_user_id <> juan_host_user_id then
    raise exception 'Cannot restore real host identities: Juan auth binding conflicts';
  end if;

  juan_auth_user_id := coalesce(
    juan_claim_user_id,
    juan_host_user_id,
    juan_auth_user_id
  );

  if juan_auth_user_id is not null and not exists (
    select 1
    from auth.users
    where id = juan_auth_user_id
      and lower(btrim(email)) = 'juan294@gmail.com'
  ) then
    raise exception 'Cannot restore real host identities: Juan auth email conflicts';
  end if;

  select auth_user_id
  into jordan_host_user_id
  from public.hosts
  where id = '00000000-0000-4000-8000-000000000202'::uuid
    and home_id = '00000000-0000-4000-8000-000000000001'::uuid;

  if not found then
    raise exception 'Cannot restore real host identities: Jordan host is missing';
  end if;

  select id
  into jordan_auth_user_id
  from auth.users
  where lower(btrim(email)) = 'jordanlynn5@gmail.com'
  order by created_at, id
  limit 1;

  jordan_auth_user_id := coalesce(jordan_host_user_id, jordan_auth_user_id);

  if jordan_auth_user_id is not null and not exists (
    select 1
    from auth.users
    where id = jordan_auth_user_id
      and lower(btrim(email)) = 'jordanlynn5@gmail.com'
  ) then
    raise exception 'Cannot restore real host identities: Jordan auth email conflicts';
  end if;

  update public.hosts
  set display_name = 'Juan González',
      locale = 'en',
      auth_user_id = juan_auth_user_id
  where id = '00000000-0000-4000-8000-000000000201'::uuid
    and home_id = '00000000-0000-4000-8000-000000000001'::uuid;

  update public.hosts
  set display_name = 'Jordan Lynn',
      locale = 'en',
      auth_user_id = jordan_auth_user_id
  where id = '00000000-0000-4000-8000-000000000202'::uuid
    and home_id = '00000000-0000-4000-8000-000000000001'::uuid;

  delete from public.host_identity_claims
  where normalized_email in ('nel@example.com', 'covadonga@example.com');

  insert into public.host_identity_claims (
    normalized_email,
    host_id,
    home_id,
    auth_user_id,
    claimed_at
  ) values
    (
      'juan294@gmail.com',
      '00000000-0000-4000-8000-000000000201'::uuid,
      '00000000-0000-4000-8000-000000000001'::uuid,
      juan_auth_user_id,
      case when juan_auth_user_id is null then null else now() end
    ),
    (
      'jordanlynn5@gmail.com',
      '00000000-0000-4000-8000-000000000202'::uuid,
      '00000000-0000-4000-8000-000000000001'::uuid,
      jordan_auth_user_id,
      case when jordan_auth_user_id is null then null else now() end
    )
  on conflict (normalized_email) do nothing;

  if (
    select count(*)
    from public.host_identity_claims
    where (normalized_email, host_id, home_id) in (
      (
        'juan294@gmail.com',
        '00000000-0000-4000-8000-000000000201'::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid
      ),
      (
        'jordanlynn5@gmail.com',
        '00000000-0000-4000-8000-000000000202'::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid
      )
    )
  ) <> 2 then
    raise exception 'Cannot restore real host identities: mapping conflict';
  end if;

  update public.host_identity_claims as claim
  set auth_user_id = mapping.auth_user_id,
      claimed_at = coalesce(claim.claimed_at, now())
  from (
    values
      ('juan294@gmail.com'::text, juan_auth_user_id),
      ('jordanlynn5@gmail.com'::text, jordan_auth_user_id)
  ) as mapping(normalized_email, auth_user_id)
  where claim.normalized_email = mapping.normalized_email
    and mapping.auth_user_id is not null
    and (claim.auth_user_id is null or claim.auth_user_id = mapping.auth_user_id);

  if exists (
    select 1
    from public.host_identity_claims as claim
    join public.hosts as host
      on host.id = claim.host_id
     and host.home_id = claim.home_id
    where claim.normalized_email in (
        'juan294@gmail.com',
        'jordanlynn5@gmail.com'
      )
      and claim.auth_user_id is distinct from host.auth_user_id
  ) then
    raise exception 'Cannot restore real host identities: auth binding conflict';
  end if;
end
$$;

create or replace function private.restore_demo_identity_claims()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.homes
    where id = '00000000-0000-4000-8000-000000000001'::uuid
      and demo = true
  ) then
    raise exception 'Cannot restore host identities: demo home is missing';
  end if;

  insert into public.host_identity_claims (
    normalized_email,
    host_id,
    home_id,
    auth_user_id,
    claimed_at
  )
  select
    mapping.normalized_email,
    host.id,
    host.home_id,
    auth_user.id,
    case when auth_user.id is null then null else now() end
  from (
    values
      (
        'juan294@gmail.com'::text,
        '00000000-0000-4000-8000-000000000201'::uuid
      ),
      (
        'jordanlynn5@gmail.com'::text,
        '00000000-0000-4000-8000-000000000202'::uuid
      )
  ) as mapping(normalized_email, host_id)
  join public.hosts as host
    on host.id = mapping.host_id
   and host.home_id = '00000000-0000-4000-8000-000000000001'::uuid
  left join lateral (
    select id
    from auth.users
    where lower(btrim(email)) = mapping.normalized_email
    order by created_at, id
    limit 1
  ) as auth_user on true
  on conflict (normalized_email) do nothing;

  if (
    select count(*)
    from public.host_identity_claims
    where (normalized_email, host_id, home_id) in (
      (
        'juan294@gmail.com',
        '00000000-0000-4000-8000-000000000201'::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid
      ),
      (
        'jordanlynn5@gmail.com',
        '00000000-0000-4000-8000-000000000202'::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid
      )
    )
  ) <> 2 then
    raise exception 'Cannot restore host identities: mapping conflict';
  end if;

  update public.host_identity_claims as claim
  set auth_user_id = auth_user.id,
      claimed_at = coalesce(claim.claimed_at, now())
  from auth.users as auth_user
  where claim.normalized_email in (
      'juan294@gmail.com',
      'jordanlynn5@gmail.com'
    )
    and lower(btrim(auth_user.email)) = claim.normalized_email
    and (claim.auth_user_id is null or claim.auth_user_id = auth_user.id);

  update public.hosts as host
  set auth_user_id = claim.auth_user_id
  from public.host_identity_claims as claim
  where claim.normalized_email in (
      'juan294@gmail.com',
      'jordanlynn5@gmail.com'
    )
    and claim.host_id = host.id
    and claim.home_id = host.home_id
    and claim.auth_user_id is not null
    and (host.auth_user_id is null or host.auth_user_id = claim.auth_user_id);

  if exists (
    select 1
    from public.host_identity_claims as claim
    join public.hosts as host
      on host.id = claim.host_id
     and host.home_id = claim.home_id
    where claim.normalized_email in (
        'juan294@gmail.com',
        'jordanlynn5@gmail.com'
      )
      and claim.auth_user_id is distinct from host.auth_user_id
  ) then
    raise exception 'Cannot restore host identities: auth binding conflict';
  end if;
end
$$;

revoke all on function private.restore_demo_identity_claims() from public;
grant execute on function private.restore_demo_identity_claims()
  to layalga_web_runtime;

do $$
begin
  if exists (
    select 1
    from public.homes
    where id = '00000000-0000-4000-8000-000000000001'::uuid
      and demo = true
  ) then
    perform private.restore_demo_identity_claims();
  end if;
end
$$;
