# Phase 1: Authoritative Inventory and Shared Occupancy

## Goal

Create a compatible PostgreSQL foundation for complete room inventory, date controls, private blocks, action proposals, calendar capabilities, and one occupancy boundary.

## Files

- Create one migration with `supabase migration new agent_first_room_coordination`.
- Update `src/core/db/schema.ts`.
- Update `supabase/seed.sql` and `src/lib/demo/reset.ts` with synthetic rooms only.
- Add migration and integration tests under `src/core/rooms/`.

## Red tests

- A SQL-backed test proves a visit occupancy and private block cannot overlap the same room.
- Schema tests prove complete inventory constraints and cross-home foreign keys.
- Migration test proves existing room and visit rows survive backfill.
- Role tests prove the agent cannot select private notes or calendar token hashes.

## Implementation

- Add room inventory fields and checks while retaining `beds` as the physical standard capacity column.
- Add non-overlapping availability overrides.
- Add private block headers.
- Make `visit_rooms.visit_id` nullable, add `private_block_id`, and add the exactly-one-source check without changing the unconditional exclusion constraint.
- Add normalized proposal and proposal-room tables.
- Add calendar feed table and calendar metadata on event sources.
- Add all composite keys, foreign keys, lookup indexes, RLS, revokes, grants, and runtime policies.
- Backfill current rows before validating new constraints.
- Seed a normal room, an overflow room, and a withheld room with synthetic names.

## Verification

```bash
supabase db reset
pnpm exec vitest run --maxWorkers=1 --no-file-parallelism src/core/rooms/schema.integration.test.ts
pnpm run typecheck
pnpm run lint
supabase db lint --local --level warning
```

## Done when

- [ ] Red tests pass.
- [ ] Existing core booking tests still pass.
- [ ] Local reset and advisors pass.
- [ ] Plan-compliance review approves the schema and privacy grants.
