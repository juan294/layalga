-- Recover active work without scanning the history of accepted email attempts.
create index guest_email_attempts_outbox_status_idx
  on public.guest_email_attempts(outbox_id,status);
create index guest_email_attempts_unresolved_idx
  on public.guest_email_attempts(authorized_at) where status='authorized';
create index guest_email_outbox_expired_lease_idx
  on public.guest_email_outbox(lease_until) where status='sending';
