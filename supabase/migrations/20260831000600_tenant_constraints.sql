alter table public.hosts
  add constraint hosts_id_home_id_key unique (id, home_id);
alter table public.parties
  add constraint parties_id_home_id_key unique (id, home_id);
alter table public.invitations
  add constraint invitations_id_home_id_key unique (id, home_id),
  add constraint invitations_host_home_fk
    foreign key (host_id, home_id)
    references public.hosts (id, home_id) on delete cascade,
  add constraint invitations_party_home_fk
    foreign key (party_id, home_id)
    references public.parties (id, home_id) on delete cascade;
alter table public.visits
  add constraint visits_id_home_id_key unique (id, home_id),
  add constraint visits_party_home_fk
    foreign key (party_id, home_id)
    references public.parties (id, home_id) on delete cascade,
  add constraint visits_invitation_home_fk
    foreign key (invitation_id, home_id)
    references public.invitations (id, home_id) on delete cascade;
alter table public.runs
  add constraint runs_id_home_id_key unique (id, home_id);
alter table public.pending_decisions
  add constraint pending_decisions_run_home_fk
    foreign key (run_id, home_id)
    references public.runs (id, home_id) on delete cascade,
  add constraint pending_decisions_visit_home_fk
    foreign key (visit_id, home_id)
    references public.visits (id, home_id) on delete cascade,
  add constraint pending_decisions_host_home_fk
    foreign key (decided_by_host_id, home_id)
    references public.hosts (id, home_id) on delete set null (decided_by_host_id);
alter table public.scheduled_jobs
  add constraint scheduled_jobs_id_home_id_key unique (id, home_id),
  add constraint scheduled_jobs_visit_home_fk
    foreign key (visit_id, home_id)
    references public.visits (id, home_id) on delete cascade;
alter table public.notifications
  add constraint notifications_visit_home_fk
    foreign key (visit_id, home_id)
    references public.visits (id, home_id) on delete cascade;
