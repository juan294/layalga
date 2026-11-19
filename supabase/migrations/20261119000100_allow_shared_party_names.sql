-- Host capture now identifies returning parties by their household-scoped ID.
alter table public.parties drop constraint parties_home_id_family_name_key;
