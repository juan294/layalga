delete from public.agent_sessions
where session_id in (
  'capture_00000000-0000-4000-8000-000000000201',
  'capture_00000000-0000-4000-8000-000000000202',
  'inv_00000000-0000-4000-8000-000000000401',
  'inv_00000000-0000-4000-8000-000000000402'
);

delete from public.homes where name = 'Casa Ayalga';

insert into public.homes (
  id,
  name,
  timezone,
  pets_together_allowed,
  max_families_with_children,
  demo
) values (
  '00000000-0000-4000-8000-000000000001',
  'Casa Ayalga',
  'Europe/Madrid',
  false,
  1,
  true
);

insert into public.rooms (id, home_id, name, beds) values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Cuartu del Horreu',
    2
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'Cuartu de la Fonte',
    2
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    'Cuartu del Teixu',
    3
  );

insert into public.hosts (id, home_id, display_name, locale) values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    'Nel',
    'es'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    'Covadonga',
    'en'
  ),
  (
    '00000000-0000-4000-8000-000000000211',
    '00000000-0000-4000-8000-000000000001',
    'Juan González',
    'en'
  ),
  (
    '00000000-0000-4000-8000-000000000212',
    '00000000-0000-4000-8000-000000000001',
    'Jordan Lynn',
    'en'
  );

select private.restore_demo_identity_claims();

insert into public.parties (
  id,
  home_id,
  family_name,
  locale,
  link_token,
  link_token_expires_at
) values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000001',
    'Familia Vega',
    'es',
    'a604963ba84cd3d54ed02d284ed2adf8c81aed6273a401cd4ae2edd8c9c0a639',
    '2026-10-01T00:00:00+02:00'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000001',
    'The Oteros',
    'en',
    'c4d65b4dc4a6da10c484c54ad1f550b803916ce5a9a7669e0ebce9c12a49c25e',
    '2026-10-01T00:00:00+02:00'
  );

insert into public.invitations (
  id,
  home_id,
  host_id,
  party_id,
  raw_message,
  structured,
  status,
  link_token,
  link_token_expires_at
) values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000301',
    'Oye, los Vega quieren venir a la casa un finde de septiembre, son Marta y Xuan con los dos crios. Les va mejor mediados de mes.',
    jsonb_build_object(
      'adults', 2,
      'children', 2,
      'pets', 0,
      'specialRequests', jsonb_build_array(),
      'preferredStay', jsonb_build_array('2026-09-18', '2026-09-21'),
      'roomAllocation', jsonb_build_array('Cuartu del Teixu', 'Cuartu del Horreu')
    ),
    'tentative',
    'a604963ba84cd3d54ed02d284ed2adf8c81aed6273a401cd4ae2edd8c9c0a639',
    '2026-10-01T00:00:00+02:00'
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000302',
    'Hi! Inviting Ana and Pelayo Otero for the weekend of the 19th, they''d bring their dog Nube and possibly Ana''s mother who uses a wheelchair.',
    jsonb_build_object(
      'adults', 2,
      'children', 0,
      'pets', 1,
      'specialRequests', jsonb_build_array(
        'Ana''s mother uses a wheelchair and needs ground-floor access'
      ),
      'preferredStay', jsonb_build_array('2026-09-19', '2026-09-21'),
      'roomAllocation', jsonb_build_array('Cuartu de la Fonte')
    ),
    'tentative',
    'c4d65b4dc4a6da10c484c54ad1f550b803916ce5a9a7669e0ebce9c12a49c25e',
    '2026-10-01T00:00:00+02:00'
  );

insert into public.demo_clock (home_id, now, enabled) values (
  '00000000-0000-4000-8000-000000000001',
  '2026-09-07T10:00:00+02:00',
  true
);
