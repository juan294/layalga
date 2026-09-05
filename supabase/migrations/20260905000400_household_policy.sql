-- Version host-owned rules for optimistic concurrency. Do not rewrite existing
-- household values (including legacy child-family limits above the UI's 20).
alter table public.homes
  add column policy_version integer not null default 1
    check (policy_version >= 1);

-- Homes are private server data. Preserve the existing web runtime permissions
-- and agent read access, while making the policy write boundary explicit.
revoke insert, update, delete on table public.homes
  from public, anon, authenticated, service_role, layalga_agent_runtime;
revoke update (pets_together_allowed, max_families_with_children, policy_version)
  on table public.homes
  from public, anon, authenticated, service_role, layalga_agent_runtime;
grant update (pets_together_allowed, max_families_with_children, policy_version)
  on table public.homes to layalga_web_runtime;
