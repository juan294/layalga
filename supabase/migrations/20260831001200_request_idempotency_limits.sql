alter table public.runs
  add column actor_key text default md5(gen_random_uuid()::text),
  add column intent_key text default md5(gen_random_uuid()::text),
  add column request_attempt_count integer not null default 1
    check (request_attempt_count between 1 and 3);

update public.runs
set actor_key = 'legacy:' || id::text,
    intent_key = 'legacy:' || id::text
where actor_key is null or intent_key is null;

alter table public.runs
  alter column actor_key set not null,
  alter column intent_key set not null,
  add constraint runs_actor_key_length_check
    check (char_length(actor_key) between 32 and 128),
  add constraint runs_intent_key_length_check
    check (char_length(intent_key) between 32 and 128),
  add constraint runs_payload_size_check
    check (octet_length(payload::text) <= 65536);

create unique index runs_home_intent_key_idx
  on public.runs (home_id, intent_key);

create index runs_actor_action_started_idx
  on public.runs (home_id, actor_key, task, started_at desc);

alter table public.parties
  add constraint parties_family_name_size_check
    check (char_length(family_name) between 1 and 120);

alter table public.invitations
  add constraint invitations_raw_message_size_check
    check (char_length(raw_message) between 1 and 4000),
  add constraint invitations_structured_size_check
    check (octet_length(structured::text) <= 16384);

alter table public.visits
  add constraint visits_party_size_check
    check (
      adults between 1 and 12
      and children between 0 and 12
      and pets between 0 and 6
    ),
  add constraint visits_special_requests_size_check
    check (
      cardinality(special_requests) <= 10
      and octet_length(array_to_string(special_requests, '')) <= 5000
    );

alter table public.pending_decisions
  add constraint pending_decisions_note_size_check
    check (note is null or char_length(note) <= 1000);
