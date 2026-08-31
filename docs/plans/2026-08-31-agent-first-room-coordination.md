# Agent-First Room Coordination Implementation Plan

> Status: ready for implementation
> Baseline: local `develop` at `d80fda4`
> Research: `docs/research/2026-08-31-room-inventory-allocation-and-agent-surfaces.md`
> Design brief: `docs/research/2026-08-31-agent-first-room-coordination-brief.md`

## Outcome

L’Ayalga will make room inventory, date availability, guest room choice, private host use, and household calendar output one authoritative coordination system. Hosts can configure rooms, open or close them for dates, and reserve them for people who will not use the app. Guests can choose one or more exact guest-visible rooms. The Strands coordinator and browser agents can read the same state and prepare actions, while deterministic services and PostgreSQL remain authoritative.

The implementation does not publish the real house plans, photographs, file paths, GPS data, or private household record. The checked-in demo remains synthetic. Unknown real room details are entered later through the host interface; incomplete rooms fail closed.

## Architecture decisions

### 1. Evolve the proven occupancy table

Keep the physical `public.visit_rooms` table because its GiST exclusion constraint already protects room/date races. Treat it as `roomOccupancies` in TypeScript and allow each row to belong to exactly one source:

```text
visit_rooms
  visit_id uuid null
  private_block_id uuid null
  CHECK num_nonnulls(visit_id, private_block_id) = 1
  EXCLUDE USING gist (room_id WITH =, stay WITH &&)
```

A guest visit and a private host block therefore cannot win the same room and dates. Existing visit rows remain valid. Code continues to delete visit occupancies when a hold expires or a visit is cancelled. A private block owns its occupancy rows and changes status through an explicit service.

### 2. Separate normal and overflow capacity

Keep the physical `rooms.beds` column for migration compatibility and map it as `standardCapacity` in TypeScript. Add:

```text
guest_label text
floor_label text
sleeping_arrangement text
overflow_arrangement text null
maximum_capacity integer
inventory_state draft | available | withheld | inactive
overflow_policy none | host_approval
display_order integer
private_notes text null
```

Checks enforce positive capacities, `maximum_capacity >= beds`, complete guest data for `available` and `withheld`, and an overflow arrangement when maximum exceeds standard. `draft` and `inactive` never enter guest availability. Existing demo rooms backfill to available, no-overflow inventory. Existing non-demo rooms backfill to draft until a host completes and reviews the inventory.

The synthetic demo will show:

- one normal room;
- one room with standard capacity two and host-approved maximum capacity four;
- one room withheld by default and openable for selected dates.

These are demo facts, not the real house inventory.

### 3. Model date controls without precedence rules

`room_availability_overrides` records a non-overlapping `open` or `close` range for one room. Normally available rooms are guest-visible unless closed. Withheld rooms are guest-visible only when one open override contains the full requested stay. Draft and inactive rooms cannot be opened.

Overlapping overrides for the same room are rejected. This avoids hidden precedence rules and makes every date state explainable.

### 4. Model private use without fake guests

`private_room_blocks` stores the host-owned date range, status, public-safe label, private note, creator, idempotency key, and request hash. Its selected rooms use the shared occupancy table. The agent role can prepare a block, but only the web role can apply or cancel it. Private notes are not granted to the agent runtime and never enter guest DTOs, prompts, WebMCP output, audit payloads, or calendar text.

### 5. Recommend, then validate exact room selection

Add `src/core/rooms/availability.ts`, `recommendation.ts`, and `occupancy.ts` as server-only application services.

```text
listGuestRoomOptions(home, stay, partySize)
  load complete rooms and full-stay date controls
  remove shared occupancies
  return guest-safe DTOs only

recommendRooms(options, partySize)
  use standard capacity only
  minimize room count
  then minimize unused standard capacity
  then sort by display_order and id

validateSelection(roomIds, home, stay, partySize)
  reject empty, duplicate, cross-home, hidden, inactive, incomplete, stale,
         occupied, and over-maximum choices
  allow when sum(standard) >= partySize
  interrupt when sum(standard) < partySize <= sum(maximum)
  deny when sum(maximum) < partySize
```

Party counts move into option search so a later count change invalidates the result. Hold creation receives canonical room IDs and overflow consent from trusted task authority, re-reads availability inside the existing home-locked transaction, and inserts the exact set. Reschedule follows the same rule.

### 6. Make consequential agent work visible

Add durable host `room_action_proposals` with normalized proposal-room rows. A Strands task can turn a natural-language host request into a bounded proposal for a private block or date opening/closure. It cannot apply the proposal. The host page displays the exact dates, room labels, and effect, then a host-authenticated Server Action rechecks and applies it once.

WebMCP is progressive enhancement. The authenticated host page registers read tools and preparation tools. The invitation page registers guest-scoped option and booking-preparation tools. Page closures supply authority; schemas do not accept `homeId`, `hostId`, invitation tokens, or database records. Preparation updates visible page state. It never commits a booking, block, or override.

### 7. Publish a revocable calendar capability

`calendar_feeds` stores only a purpose-bound HMAC of a 32-byte random bearer token. A host can issue more than one feed and revoke each independently. The route returns the same 404 for unknown and revoked tokens and does not mutate state on GET.

Confirmed, reconfirmation, and escalated visits plus active private blocks become all-day events. `calendar_eligible_at`, `calendar_updated_at`, and `calendar_sequence` on source rows provide stable UIDs, updates, and cancellation tombstones without a side-effecting feed read. Output uses CRLF, RFC escaping, UTF-8-safe 75-octet folding, deterministic ordering, and a stable ETag. It excludes guest names, email, invitation data, special requests, arrival information, private notes, and all tokens.

## Security and privacy boundaries

- Every Server Action re-authenticates the host or re-resolves the invitation capability and rechecks record ownership.
- Client components receive explicit DTOs, never database rows.
- Host-only data access modules use `server-only`.
- PostgreSQL composite foreign keys keep every relationship in one home.
- New tables enable RLS, revoke `anon`, `authenticated`, and `service_role`, then grant only required columns and operations to the two runtime roles.
- The agent role cannot read private room notes, private block notes, calendar tokens, or raw proposal notes.
- WebMCP output is bounded and labels database-derived text as untrusted content.
- Calendar tokens use a distinct purpose prefix and `CALENDAR_FEED_SECRET`; no raw token is stored.
- No real house media or private source path is added to Git, seed data, prompts, browser output, or the app.

## Delivery phases

- [x] Phase 1: authoritative inventory and occupancy migration
- [x] Phase 2 `[batch-eligible after Phase 1]`: deterministic room operations and exact selection
- [x] Phase 3 `[batch-eligible after Phase 1]`: revocable iCalendar feed
- [x] Phase 4: host and guest room interfaces
- [x] Phase 5: Strands room coordination and WebMCP preparation
- [ ] Phase 6: demo proof, documentation, and full validation

Phases 2 and 3 have separate files and may run in parallel only after Phase 1. This implementation run will execute them sequentially unless a separate batch workflow is authorized.

Detailed phase files are in `docs/plans/2026-08-31-agent-first-room-coordination-phases/`.

## Verification contract

Each phase follows red, green, refactor: first add a failing executable artifact, implement the smallest correct change, run a plan-compliance review, run the Codex simplify pass, then run the phase commands sequentially.

Final automated verification:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run test:e2e
pnpm run demo:e2e
pnpm run release:probes
bash scripts/verify-bootstrap.sh
supabase db lint --local --level warning
```

The local Supabase stack must be reset before database-backed verification. No remote migration, push, deployment, calendar subscription, publication, tag, or release is part of this plan.

## Automated acceptance criteria

1. Migration and reset preserve existing visit occupancies and enforce one shared room/date exclusion boundary for visits and private blocks.
2. Incomplete, inactive, withheld-without-opening, closed, occupied, and cross-home rooms fail closed.
3. Recommendation is deterministic and minimizes room count, then unused standard capacity.
4. Exact multi-room choices persist unchanged and reject stale or insufficient selections.
5. Standard capacity succeeds without review; overflow-only capacity produces a host interrupt; capacity above maximum is denied.
6. Private blocks and overrides are home-scoped, idempotent, audited, and safe under concurrent requests.
7. Guest outputs contain only guest-visible labels and their own assigned rooms.
8. Calendar output is revocable, byte-stable, standards-compliant, private, and non-mutating on GET.
9. Strands tools and WebMCP tools reuse the same room services and cannot bypass confirmation or authority.
10. English and Spanish unit, integration, component, and Playwright coverage exercises the complete story.

## Manual acceptance criteria

1. A host completes synthetic room inventory and sees door states in the house ledger.
2. A host asks the coordinator to reserve a room for a family member, reviews the proposal, confirms it, and sees the room disappear from guest options.
3. A guest chooses multiple exact rooms and later sees those room labels on their visit.
4. A host opens the withheld synthetic room for selected dates and it appears only during that range.
5. An overflow request pauses with the exact sleeping arrangement and resumes once after host approval.
6. A browser agent can read options and prepare the visible host or guest form, but the person makes the final submission.
7. A subscribed calendar shows confirmed visits and private room use with no sensitive guest or household text.

## Deferred follow-ons

- Telegram or another chat channel over the same services, after identity binding and consent are designed.
- A remote MCP server with OAuth resource binding, audience validation, PKCE, revocation, and rate limits.
- Direct Google Calendar or iCloud writes and two-way synchronization.
- Publication of selected room photographs after a separate host privacy decision.

## Rollback and release notes

The migration is additive and compatible with the current application after backfill. Application rollback is safe while new columns remain. Database rollback would require a separately reviewed migration after proving that no private blocks, overrides, proposals, or calendar feeds remain. This is a schema migration, so any remote application is a separate production authorization gate.
