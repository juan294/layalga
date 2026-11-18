alter table public.invitations
  add column capture_run_id uuid unique references public.runs(id) on delete set null,
  add column link_scheme smallint,
  add column link_generation uuid,
  add column link_locale text,
  add constraint invitations_recovery_metadata_check check (
    num_nonnulls(link_scheme, link_generation, link_locale) = 0 or
    (num_nonnulls(link_scheme, link_generation, link_locale) = 3 and
     link_scheme = 1 and link_locale in ('en', 'es'))
  );
