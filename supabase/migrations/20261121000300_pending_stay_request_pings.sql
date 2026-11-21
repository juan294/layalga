alter table public.host_email_pings drop constraint host_email_pings_kind_check;
alter table public.host_email_pings add constraint host_email_pings_kind_check
  check (kind in ('pending_decision', 'reconfirm_escalation', 'pending_stay_request'));
