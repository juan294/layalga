alter table public.rooms
  add constraint rooms_id_home_id_key unique (id, home_id);

alter table public.visit_rooms
  add column home_id uuid;

update public.visit_rooms as visit_room
set home_id = visit.home_id
from public.visits as visit
where visit.id = visit_room.visit_id;

alter table public.visit_rooms
  alter column home_id set not null,
  add constraint visit_rooms_visit_home_fk
    foreign key (visit_id, home_id)
    references public.visits (id, home_id) on delete cascade,
  add constraint visit_rooms_room_home_fk
    foreign key (room_id, home_id)
    references public.rooms (id, home_id) on delete cascade;

alter table public.notifications
  add constraint notifications_job_home_fk
    foreign key (scheduled_job_id, home_id)
    references public.scheduled_jobs (id, home_id) on delete set null (scheduled_job_id);

alter table public.pending_decisions
  add constraint pending_decisions_applied_run_home_fk
    foreign key (applied_run_id, home_id)
    references public.runs (id, home_id) on delete set null (applied_run_id);
