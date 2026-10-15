-- Local development household. Sign in with Google as one of the claimed
-- host emails below (configure the local Google OAuth client from
-- .env.example), or let tests build their own fixture households.

insert into public.homes (
  id,
  name,
  timezone,
  pets_together_allowed,
  max_families_with_children
) values (
  '00000000-0000-4000-8000-000000000001',
  'Casa Ayalga',
  'Europe/Madrid',
  false,
  1
);

insert into public.rooms (
  id,
  home_id,
  name,
  beds,
  guest_label,
  floor_label,
  sleeping_arrangement,
  overflow_arrangement,
  maximum_capacity,
  inventory_state,
  overflow_policy,
  display_order
) values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Upstairs guest room',
    2,
    'Guest Room',
    'Upper floor',
    'One double bed',
    null,
    2,
    'available',
    'none',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'Garage conversion',
    2,
    'Garage Room',
    'Ground floor',
    'One sofa bed',
    'One double air mattress',
    4,
    'available',
    'host_approval',
    2
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    'Home office',
    3,
    'Office Room',
    'Upper floor',
    'One double bed',
    null,
    3,
    'withheld',
    'none',
    3
  );

insert into public.hosts (id, home_id, display_name, locale) values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    'Juan González',
    'en'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    'Jordan Lynn',
    'en'
  );

insert into public.host_identity_claims (normalized_email, host_id, home_id) values
  (
    'juan294@gmail.com',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    'jordanlynn5@gmail.com',
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001'
  );
