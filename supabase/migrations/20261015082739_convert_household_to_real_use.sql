-- Convert the former demo household to real use.
--
-- Home 00000000-0000-4000-8000-000000000001 keeps its row, hosts, host
-- identity claims, calendar feeds and host notification settings. Every
-- synthetic guest, room and agent artefact is deleted, and the home stops
-- being a demo home. Audit rows that record a memory erasure are kept as the
-- accountability record for that erasure. The block acts only while the home
-- is still a demo home, so it is a no-op on a fresh database and when applied
-- again.

do $$
declare
  converted_home constant uuid := '00000000-0000-4000-8000-000000000001';
begin
  if not exists (
    select 1 from public.homes where id = converted_home and demo
  ) then
    return;
  end if;

  -- Durable agent sessions are keyed by session id, not by home.
  delete from public.agent_sessions
  where session_id in (
    select session_id from public.runs where home_id = converted_home
    union all
    select 'inv_' || id from public.invitations where home_id = converted_home
    union all
    select 'capture_' || id from public.hosts where home_id = converted_home
    union all
    select 'room_' || id from public.hosts where home_id = converted_home
    union all
    select 'tick_' || id from public.scheduled_jobs where home_id = converted_home
  );

  delete from public.audit_events
  where home_id = converted_home and kind <> 'memory_forgotten';
  delete from public.pending_decisions where home_id = converted_home;
  delete from public.notifications where home_id = converted_home;
  delete from public.host_email_pings where home_id = converted_home;
  delete from public.guest_email_outbox where home_id = converted_home;
  -- Room and run keys reference these, so they go before rooms and runs.
  delete from public.room_action_proposals where home_id = converted_home;
  delete from public.private_room_blocks where home_id = converted_home;
  delete from public.room_availability_overrides where home_id = converted_home;
  delete from public.runs where home_id = converted_home;
  -- Cascades to invitations, visits, visit rooms, scheduled jobs and guest
  -- contacts.
  delete from public.parties where home_id = converted_home;
  delete from public.rooms where home_id = converted_home;
  delete from public.demo_clock where home_id = converted_home;
  delete from public.demo_mutation_leases where home_id = converted_home;
  delete from public.demo_mutation_limits where home_id = converted_home;

  update public.homes set demo = false where id = converted_home;
end
$$;
