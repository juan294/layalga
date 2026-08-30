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
    raise exception 'Cannot restore demo identities: demo home is missing';
  end if;

  insert into public.host_identity_claims (
    normalized_email,
    host_id,
    home_id
  )
  select
    mapping.normalized_email,
    host.id,
    host.home_id
  from (
    values
      ('nel@example.com'::text, '00000000-0000-4000-8000-000000000201'::uuid),
      ('juan294@gmail.com'::text, '00000000-0000-4000-8000-000000000201'::uuid),
      ('covadonga@example.com'::text, '00000000-0000-4000-8000-000000000202'::uuid)
  ) as mapping(normalized_email, host_id)
  join public.hosts as host
    on host.id = mapping.host_id
   and host.home_id = '00000000-0000-4000-8000-000000000001'::uuid
  on conflict (normalized_email) do nothing;

  if (
    select count(*)
    from public.host_identity_claims
    where (normalized_email, host_id, home_id) in (
      ('nel@example.com',
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid),
      ('juan294@gmail.com',
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid),
      ('covadonga@example.com',
       '00000000-0000-4000-8000-000000000202'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid)
    )
  ) <> 3 then
    raise exception 'Cannot restore demo identities: mapping conflict';
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
