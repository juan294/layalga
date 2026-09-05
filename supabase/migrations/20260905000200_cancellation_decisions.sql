-- Preserve withdrawn approval history without allowing resume/retry to apply it.
alter table public.pending_decisions
  drop constraint pending_decisions_status_check,
  add constraint pending_decisions_status_check
    check (status in ('pending', 'approved', 'declined', 'cancelled'));
