# Phase 3: Revocable Household Calendar `[batch-eligible after Phase 1]`

## Goal

Provide a stable host-only iCalendar subscription without third-party authorization tokens or sensitive household text.

## Files

- Add `src/core/calendar/feed-token.ts`, `ical.ts`, `calendar-feed.ts`, and tests.
- Add `src/app/calendar/[token]/route.ts` and route tests.
- Add host issue/revoke Server Actions and minimal host DTOs.
- Update server environment parsing and `.env.example` for `CALENDAR_FEED_SECRET`.

## Red tests

- Token issue stores only the purpose-bound HMAC and revocation invalidates it.
- Unknown and revoked tokens return the same 404 response.
- Repeated GETs return identical bytes and ETags and make no database writes.
- UTF-8 lines fold at 75 octets, dates remain half-open all-day values, and RFC escaping is correct.
- Confirmed events, active blocks, changes, and cancellation tombstones have stable UIDs and sequence values.
- Output excludes names, emails, invitations, special requests, arrival details, private notes, and tokens.

## Implementation

- Issue 32 random bytes, store only HMAC with `calendar-feed:v1` domain separation.
- Render deterministic, locale-bound calendar bytes with CRLF.
- Use source calendar metadata rather than feed-read mutations.
- Return `text/calendar`, private no-store, no-referrer, nosniff, ETag, and no CORS expansion.
- Let authenticated hosts issue and revoke independent feeds.

## Verification

```bash
pnpm exec vitest run --maxWorkers=1 --no-file-parallelism src/core/calendar src/app/calendar
pnpm run typecheck
pnpm run lint
pnpm run build
```

## Done when

- [x] Red tests pass.
- [x] Route has no GET side effects.
- [x] Privacy snapshot contains only approved fields.
- [x] Plan-compliance review approves token and calendar semantics.
