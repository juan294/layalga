# Phase 2: Deterministic Room Operations and Exact Selection `[batch-eligible after Phase 1]`

## Goal

Make one server-only service layer authoritative for guest-safe availability, recommendation, exact selection, overrides, and private blocks.

## Files

- Add `src/core/rooms/types.ts`, `availability.ts`, `recommendation.ts`, `occupancy.ts`, and focused tests.
- Update `src/core/policy/evaluate-overlap.ts` and its tests.
- Update `src/core/booking/holds.ts`, `house-state.ts`, and concurrency tests.
- Update trusted agent task authority types without adding new model tools yet.

## Red tests

- Recommendation minimizes room count, waste, display order, then ID.
- Guest availability excludes every fail-closed state and never returns private fields.
- Exact selection rejects duplicates, cross-home IDs, hidden rooms, stale choices, and insufficient maximum capacity.
- Standard selection allows, overflow-only selection interrupts with exact arrangements, and above-maximum selection denies.
- Concurrent private block and visit requests produce one winner.
- Retry with the same idempotency key and request hash returns one result; a changed request conflicts.

## Implementation

- Query room state and occupancies in bounded date windows.
- Replace largest-first automatic allocation with the deterministic recommender.
- Accept optional exact room IDs on hold and reschedule inputs.
- Put canonical room IDs and overflow consent in trusted authority, not model-controlled tool input.
- Re-read and validate the exact selection inside the home-locked booking transaction.
- Add host services to create/cancel private blocks and create/remove availability overrides with audit events.
- Keep visit cancellation and hold expiry responsible only for their own occupancy rows.

## Verification

```bash
pnpm exec vitest run --maxWorkers=1 --no-file-parallelism src/core/rooms src/core/policy src/core/booking/holds.concurrency.test.ts
pnpm run typecheck
pnpm run lint
```

## Done when

- [x] Red tests pass.
- [x] Existing booking and policy tests pass.
- [x] Concurrency proves the shared exclusion constraint.
- [x] Plan-compliance review approves exact selection and privacy DTOs.
