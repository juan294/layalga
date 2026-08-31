# Phase 4: Host and Guest Room Interfaces

## Goal

Give hosts a house ledger for room truth and private use, and give guests a clear exact multi-room selection flow.

## Files

- Add host room DTOs, Server Actions, room-ledger components, proposal review, and styles.
- Update `src/app/[locale]/(host)/page.tsx` and calendar ledger data.
- Update guest data/actions/page and `guest-invite-form.tsx`.
- Update `messages/en.json`, `messages/es.json`, component tests, and Playwright flows.

## Red tests

- Host Actions re-authenticate and reject cross-home or stale room IDs.
- Guest option search includes party counts and returns only guest-safe fields.
- Changing dates or counts marks the room recommendation stale.
- Guest can select multiple rooms and sees only its own assigned guest labels later.
- Keyboard, focus, mobile agenda, and English/Spanish assertions pass.

## Implementation

- Put the room ledger before the visit calendar.
- Render horizontal door rows with text and shape states for available, occupied, private, closed, and withheld.
- Add inventory edit, date close/open, private block, proposal confirmation, and calendar feed controls.
- Use thin Server Actions over the server-only services and `revalidatePath` for read-your-own-writes.
- Change the guest flow to dates plus party, exact room choice, then review and submit.
- Preselect the deterministic recommendation but allow any valid multi-room set.
- Show guest label, floor, sleeping arrangement, standard/max capacity, and explicit overflow consent.

## Visual direction

Preserve Paper Ink, Fraunces headings, mono folios, square controls, strong rules, and the existing ledger rhythm. The signature addition is a plan-like door-state strip, not a generic settings card grid.

## Verification

```bash
pnpm exec vitest run --maxWorkers=1 --no-file-parallelism src/components/host src/components/guest 'src/app/[locale]'
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm exec playwright test --grep 'room|guest|host'
```

## Done when

- [x] Red tests pass in English and Spanish.
- [x] Exact room selection persists through the real hold path.
- [x] Private data does not cross a client DTO boundary.
- [x] Plan-compliance and visual reviews approve the interface.
