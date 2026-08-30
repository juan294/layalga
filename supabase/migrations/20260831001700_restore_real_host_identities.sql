do $$
declare
  existing_claim_user_id uuid;
  existing_nel_user_id uuid;
  juan_user_id uuid;
begin
  if not exists (
    select 1
    from public.homes
    where id = '00000000-0000-4000-8000-000000000001'::uuid
      and demo = true
  ) then
    return;
  end if;

  insert into public.hosts (id, home_id, display_name, locale)
  values
    (
      '00000000-0000-4000-8000-000000000211'::uuid,
      '00000000-0000-4000-8000-000000000001'::uuid,
      'Juan González',
      'en'
    ),
    (
      '00000000-0000-4000-8000-000000000212'::uuid,
      '00000000-0000-4000-8000-000000000001'::uuid,
      'Jordan Lynn',
      'en'
    )
  on conflict (id) do nothing;

  if (
    select count(*)
    from public.hosts
    where (id, home_id, display_name) in (
      (
        '00000000-0000-4000-8000-000000000211'::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid,
        'Juan González'
      ),
      (
        '00000000-0000-4000-8000-000000000212'::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid,
        'Jordan Lynn'
      )
    )
  ) <> 2 then
    raise exception 'Cannot restore real host identities: host mapping conflict';
  end if;

  select claim.auth_user_id, nel.auth_user_id
  into existing_claim_user_id, existing_nel_user_id
  from public.host_identity_claims as claim
  join public.hosts as nel
    on nel.id = '00000000-0000-4000-8000-000000000201'::uuid
   and nel.home_id = claim.home_id
  where claim.normalized_email = 'juan294@gmail.com'
    and claim.host_id in (
      '00000000-0000-4000-8000-000000000201'::uuid,
      '00000000-0000-4000-8000-000000000211'::uuid
    );

  if not found then
    raise exception 'Cannot restore real host identities: Juan claim is missing or conflicts';
  end if;
  if existing_claim_user_id is not null
     and existing_nel_user_id is not null
     and existing_claim_user_id <> existing_nel_user_id then
    raise exception 'Cannot restore real host identities: Juan auth binding conflicts';
  end if;

  juan_user_id := coalesce(existing_claim_user_id, existing_nel_user_id);
  if juan_user_id is not null and not exists (
    select 1
    from auth.users
    where id = juan_user_id
      and lower(btrim(email)) = 'juan294@gmail.com'
  ) then
    raise exception 'Cannot restore real host identities: Juan auth email conflicts';
  end if;

  update public.hosts
  set auth_user_id = null
  where id = '00000000-0000-4000-8000-000000000201'::uuid
    and auth_user_id = juan_user_id;

  update public.host_identity_claims
  set host_id = '00000000-0000-4000-8000-000000000211'::uuid,
      home_id = '00000000-0000-4000-8000-000000000001'::uuid
  where normalized_email = 'juan294@gmail.com';

  update public.hosts
  set auth_user_id = juan_user_id
  where id = '00000000-0000-4000-8000-000000000211'::uuid
    and home_id = '00000000-0000-4000-8000-000000000001'::uuid;
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
        'nel@example.com'::text,
        '00000000-0000-4000-8000-000000000201'::uuid,
        false
      ),
      (
        'covadonga@example.com'::text,
        '00000000-0000-4000-8000-000000000202'::uuid,
        false
      ),
      (
        'juan294@gmail.com'::text,
        '00000000-0000-4000-8000-000000000211'::uuid,
        true
      ),
      (
        'jordanlynn5@gmail.com'::text,
        '00000000-0000-4000-8000-000000000212'::uuid,
        true
      )
  ) as mapping(normalized_email, host_id, real_operator)
  join public.hosts as host
    on host.id = mapping.host_id
   and host.home_id = '00000000-0000-4000-8000-000000000001'::uuid
  left join lateral (
    select id
    from auth.users
    where mapping.real_operator
      and lower(btrim(email)) = mapping.normalized_email
    order by created_at, id
    limit 1
  ) as auth_user on true
  on conflict (normalized_email) do nothing;

  if (
    select count(*)
    from public.host_identity_claims
    where (normalized_email, host_id, home_id) in (
      (
        'nel@example.com',
        '00000000-0000-4000-8000-000000000201'::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid
      ),
      (
        'covadonga@example.com',
        '00000000-0000-4000-8000-000000000202'::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid
      ),
      (
        'juan294@gmail.com',
        '00000000-0000-4000-8000-000000000211'::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid
      ),
      (
        'jordanlynn5@gmail.com',
        '00000000-0000-4000-8000-000000000212'::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid
      )
    )
  ) <> 4 then
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
