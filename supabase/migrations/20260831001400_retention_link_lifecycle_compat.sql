-- Link fields are optional as a pair. Application code supplies both values
-- for live links; a default expiry would create an invalid half-pair for
-- internal and historical invitations without a guest capability.
alter table public.invitations
  alter column link_token_expires_at drop default;

-- An empty raw message is the intentional terminal state produced by the
-- retention job. Request and application schemas still reject empty input.
alter table public.invitations
  drop constraint invitations_raw_message_size_check,
  add constraint invitations_raw_message_size_check
    check (char_length(raw_message) <= 4000);
