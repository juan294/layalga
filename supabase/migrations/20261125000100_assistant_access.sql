-- Token policy for connected assistants. Auth calls the hook only where its
-- configuration names it. An administrator activates a client: no runtime role
-- can write the allowlist.
create table public.assistant_clients (
  client_id uuid primary key,
  assistant text not null check (assistant in ('claude','chatgpt')),
  -- Auth joins callbacks with commas and reports them without a query.
  redirect_uri text not null
    check (redirect_uri ~ '^https://[^,?#[:space:]]+$' and char_length(redirect_uri) <= 500),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.assistant_request_windows (
  subject text not null check (char_length(subject) <= 100),
  span text not null check (span in ('minute','day')),
  started_at timestamptz not null,
  requests integer not null check (requests > 0),
  primary key (subject, span)
);

alter table public.assistant_clients enable row level security;
alter table public.assistant_request_windows enable row level security;
revoke all on public.assistant_clients, public.assistant_request_windows
  from public, anon, authenticated, service_role, layalga_agent_runtime, layalga_web_runtime;

grant select on public.assistant_clients to layalga_web_runtime, supabase_auth_admin;
grant select, insert, update on public.assistant_request_windows to layalga_web_runtime;
create policy web_runtime_assistant_clients on public.assistant_clients
  for select to layalga_web_runtime using (true);
create policy web_runtime_assistant_request_windows on public.assistant_request_windows
  for all to layalga_web_runtime using (true) with check (true);

grant usage on schema public, private to supabase_auth_admin;
grant select (auth_user_id) on public.hosts to supabase_auth_admin;
grant select (normalized_email) on public.host_identity_claims to supabase_auth_admin;
create policy auth_hook_assistant_clients on public.assistant_clients
  for select to supabase_auth_admin using (true);
-- The same lock order as a host sign-in.
create policy auth_hook_host_identity_claims on public.host_identity_claims
  for select to supabase_auth_admin using (true);
create policy auth_hook_hosts on public.hosts
  for select to supabase_auth_admin using (true);

-- Auth runs this for every token. A web token must come back unchanged: that
-- branch reads no table and cannot raise, so it cannot stop web sign-in. The
-- refusal names no reason because the assistant's vendor sees it.
create function private.access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  refused constant jsonb := '{"error":{"http_code":403,"message":"assistant connection refused"}}';
  token_claims jsonb;
  token_client uuid;
  token_user uuid;
  token_email text;
begin
  if (event -> 'claims' ? 'client_id'
    or starts_with(event ->> 'authentication_method', 'oauth_provider/')) is not true then
    return event;
  end if;

  begin
    token_claims := event -> 'claims';
    token_client := (token_claims ->> 'client_id')::uuid;
    token_user := (event ->> 'user_id')::uuid;
    token_email := lower(btrim(token_claims ->> 'email'));
    if token_client is null or token_user is null or coalesce(token_email, '') = '' then
      return refused;
    end if;

    if not exists (
      select 1
      from public.assistant_clients allowed
      join auth.oauth_clients registered on registered.id = allowed.client_id
      where allowed.client_id = token_client
        and allowed.enabled
        and registered.deleted_at is null
        and registered.redirect_uris = allowed.redirect_uri
    ) then
      return refused;
    end if;

    if exists (select 1 from public.hosts where auth_user_id = token_user)
      or exists (select 1 from public.host_identity_claims where normalized_email = token_email) then
      return refused;
    end if;

    return jsonb_build_object(
      'claims',
      (token_claims - array['user_metadata', 'app_metadata', 'amr']) || jsonb_build_object(
        'aud', 'https://layalga.thecreativetoken.com/api/mcp',
        'role', 'layalga_assistant',
        'email', '',
        'phone', ''
      )
    );
  exception when others then
    return refused;
  end;
end $$;
revoke all on function private.access_token_hook(jsonb)
  from public, anon, authenticated, service_role, layalga_web_runtime, layalga_agent_runtime;
grant execute on function private.access_token_hook(jsonb) to supabase_auth_admin;

alter function private.apply_data_retention(timestamptz) rename to apply_data_retention_before_assistant_access;
create function private.apply_data_retention(p_now timestamptz default now())
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; deleted integer;
begin
  result := private.apply_data_retention_before_assistant_access(p_now);
  -- A window that a request is counting now is not waited for.
  delete from public.assistant_request_windows where (subject, span) in (
    select subject, span from public.assistant_request_windows
    where started_at < p_now - interval '2 days' for update skip locked
  );
  get diagnostics deleted = row_count;
  return result || jsonb_build_object('deletedAssistantWindows', deleted);
end $$;
revoke all on function private.apply_data_retention(timestamptz)
  from public, anon, authenticated, service_role, layalga_web_runtime, layalga_agent_runtime;
